const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export interface StateResponse {
  selectedOrder: number[];
  extraIds: number[];
  maxId: number;
}

export interface UnselectedPage {
  items: number[];
  total: number;
}

type FetchKey = string;

interface PendingFetch {
  path: string;
  resolveList: Array<(value: unknown) => void>;
  rejectList: Array<(reason?: unknown) => void>;
}

const pendingFetches = new Map<FetchKey, PendingFetch>();
let fetchTimer: number | null = null;

const addItemIds = new Set<number>();
let addItemsTimer: number | null = null;

let pendingSelectionOrder: number[] | null = null;
let selectionTimer: number | null = null;

function startFetchTimer() {
  if (fetchTimer !== null) return;
  fetchTimer = window.setInterval(() => {
    if (pendingFetches.size === 0) return;
    const entries = Array.from(pendingFetches.values());
    pendingFetches.clear();
    for (const entry of entries) {
      fetch(`${API_BASE}${entry.path}`)
        .then(async (r) => {
          if (!r.ok) {
            const err = new Error(`Request failed: ${r.status}`);
            entry.rejectList.forEach((rej) => rej(err));
            return;
          }
          const data = await r.json();
          entry.resolveList.forEach((res) => res(data));
        })
        .catch((e) => {
          entry.rejectList.forEach((rej) => rej(e));
        });
    }
  }, 1000);
}

function enqueueGet<T>(path: string, key: FetchKey): Promise<T> {
  startFetchTimer();
  const existing = pendingFetches.get(key);
  if (existing) {
    return new Promise<T>((resolve, reject) => {
      existing.resolveList.push(resolve as (v: unknown) => void);
      existing.rejectList.push(reject);
    });
  }
  const pending: PendingFetch = {
    path,
    resolveList: [],
    rejectList: [],
  };
  pendingFetches.set(key, pending);
  return new Promise<T>((resolve, reject) => {
    pending.resolveList.push(resolve as (v: unknown) => void);
    pending.rejectList.push(reject);
  });
}

function startAddItemsTimer() {
  if (addItemsTimer !== null) return;
  addItemsTimer = window.setInterval(() => {
    if (addItemIds.size === 0) return;
    const ids = Array.from(addItemIds);
    addItemIds.clear();
    fetch(`${API_BASE}/items/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, 10_000);
}

function startSelectionTimer() {
  if (selectionTimer !== null) return;
  selectionTimer = window.setInterval(() => {
    if (!pendingSelectionOrder) return;
    const order = pendingSelectionOrder;
    pendingSelectionOrder = null;
    fetch(`${API_BASE}/selected`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }).catch(() => {});
  }, 1000);
}

export function getInitialState(): Promise<StateResponse> {
  return enqueueGet<StateResponse>('/state', 'state');
}

export function getUnselectedPage(
  filter: string,
  offset: number,
  limit: number,
): Promise<UnselectedPage> {
  const params = new URLSearchParams();
  if (filter.trim()) params.set('filter', filter.trim());
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  const path = `/unselected?${params.toString()}`;
  const key = `unselected:${filter}:${offset}:${limit}`;
  return enqueueGet<UnselectedPage>(path, key);
}

export function enqueueAddItem(id: number) {
  if (!Number.isFinite(id) || id <= 0) return;
  if (!addItemIds.has(id)) {
    addItemIds.add(id);
    startAddItemsTimer();
  }
}

export function enqueueSelectionUpdate(order: number[]) {
  pendingSelectionOrder = order.slice();
  startSelectionTimer();
}


