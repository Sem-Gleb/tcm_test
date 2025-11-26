import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  enqueueAddItem,
  enqueueSelectionUpdate,
  getInitialState,
  getUnselectedPage,
} from './api';

const PAGE_SIZE = 20;

function App() {
  const [loaded, setLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [maxId, setMaxId] = useState(1_000_000);

  const [leftFilter, setLeftFilter] = useState('');
  const [rightFilter, setRightFilter] = useState('');

  const [leftItems, setLeftItems] = useState<number[]>([]);
  const [leftTotal, setLeftTotal] = useState(0);
  const [leftPage, setLeftPage] = useState(0);
  const [leftLoading, setLeftLoading] = useState(false);

  const [localExtraIds, setLocalExtraIds] = useState<number[]>([]);

  const leftObserverRef = useRef<IntersectionObserver | null>(null);
  const leftSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getInitialState()
      .then((state) => {
        setSelectedOrder(state.selectedOrder ?? []);
        setMaxId(state.maxId ?? 1_000_000);
        setLoaded(true);
      })
      .catch((e) => {
        setLoadingError(String(e));
      });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setLeftItems([]);
    setLeftTotal(0);
    setLeftPage(0);
     setLeftLoading(false);
  }, [leftFilter, selectedOrder, loaded]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    async function loadPage(page: number) {
      setLeftLoading(true);
      try {
        const offset = page * PAGE_SIZE;
        const res = await getUnselectedPage(leftFilter, offset, PAGE_SIZE);
        if (cancelled) return;
        if (page === 0) {
          setLeftItems(res.items);
        } else {
          setLeftItems((prev) => [...prev, ...res.items]);
        }
        setLeftTotal(res.total);
      } finally {
        if (!cancelled) setLeftLoading(false);
      }
    }
    loadPage(leftPage);
    return () => {
      cancelled = true;
    };
  }, [leftPage, leftFilter, loaded]);

  const leftExtraFiltered = useMemo(() => {
    const filter = leftFilter.trim();
    const selectedSet = new Set(selectedOrder);
    return localExtraIds.filter((id) => {
      if (selectedSet.has(id)) return false;
      if (filter && !String(id).includes(filter)) return false;
      return true;
    });
  }, [localExtraIds, selectedOrder, leftFilter]);

  const leftComputedItems = useMemo(() => {
    const merged = [...leftExtraFiltered];
    for (const id of leftItems) {
      if (!merged.includes(id)) {
        merged.push(id);
      }
    }
    return merged;
  }, [leftExtraFiltered, leftItems]);

  const leftComputedTotal = useMemo(
    () => leftTotal + leftExtraFiltered.length,
    [leftTotal, leftExtraFiltered.length],
  );

  useEffect(() => {
    if (leftObserverRef.current) {
      leftObserverRef.current.disconnect();
    }
    leftObserverRef.current = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry.isIntersecting) return;
      if (leftLoading) return;
      const loadedCount = leftComputedItems.length;
      if (loadedCount >= leftComputedTotal) return;
      setLeftPage((p) => p + 1);
    });
    if (leftSentinelRef.current) {
      leftObserverRef.current.observe(leftSentinelRef.current);
    }
    return () => {
      if (leftObserverRef.current) {
        leftObserverRef.current.disconnect();
      }
    };
  }, [leftComputedItems.length, leftComputedTotal, leftLoading]);

  const filteredSelected = useMemo(() => {
    if (!rightFilter.trim()) return selectedOrder;
    return selectedOrder.filter((id) =>
      String(id).includes(rightFilter.trim()),
    );
  }, [selectedOrder, rightFilter]);

  const [rightVisibleCount, setRightVisibleCount] = useState(PAGE_SIZE);
  const rightObserverRef = useRef<IntersectionObserver | null>(null);
  const rightSentinelRef = useRef<HTMLDivElement | null>(null);

  const visibleSelected = useMemo(
    () => filteredSelected.slice(0, rightVisibleCount),
    [filteredSelected, rightVisibleCount],
  );

  useEffect(() => {
    setRightVisibleCount(PAGE_SIZE);
  }, [rightFilter, selectedOrder]);

  useEffect(() => {
    if (rightObserverRef.current) {
      rightObserverRef.current.disconnect();
    }
    rightObserverRef.current = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry.isIntersecting) return;
      setRightVisibleCount((prev) => {
        if (prev >= filteredSelected.length) return prev;
        return prev + PAGE_SIZE;
      });
    });
    if (rightSentinelRef.current) {
      rightObserverRef.current.observe(rightSentinelRef.current);
    }
    return () => {
      if (rightObserverRef.current) {
        rightObserverRef.current.disconnect();
      }
    };
  }, [filteredSelected.length]);

  const [draggingId, setDraggingId] = useState<number | null>(null);

  function commitSelectedOrder(next: number[]) {
    setSelectedOrder(next);
    enqueueSelectionUpdate(next);
  }

  function handleAddToSelected(id: number) {
    if (selectedOrder.includes(id)) return;
    const next = [...selectedOrder, id];
    commitSelectedOrder(next);
  }

  function handleRemoveFromSelected(id: number) {
    const next = selectedOrder.filter((x) => x !== id);
    commitSelectedOrder(next);
  }

  function handleNewItemSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const raw = (data.get('newId') ?? '').toString().trim();
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return;
    if (id <= maxId) {
      form.reset();
      return;
    }
    enqueueAddItem(id);
    setLocalExtraIds((prev) =>
      prev.includes(id) ? prev : [...prev, id],
    );
    form.reset();
  }

  function handleDragStart(id: number) {
    setDraggingId(id);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handleDrop(targetId: number) {
    if (draggingId == null || draggingId === targetId) return;
    const fromId = draggingId;
    setDraggingId(null);
    const next = [...selectedOrder];
    const fromIndex = next.indexOf(fromId);
    const toIndex = next.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    next.splice(fromIndex, 1);
    const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(adjustedTo, 0, fromId);
    commitSelectedOrder(next);
  }

  if (loadingError) {
    return (
      <div className="app-root">
        <h1>Список ID</h1>
        <p className="error">Ошибка загрузки: {loadingError}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="app-root">
        <h1>Список ID</h1>
        <p>Загрузка состояния...</p>
      </div>
    );
  }

  return (
    <div className="app-root">
      <h1>Список ID (1млн элементов)</h1>
      <p className="subtitle">
        Левое окно — доступные элементы, правое — выбранные (с сохранением порядка на сервере).
      </p>
      <div className="top-bar">
        <form className="new-item-form" onSubmit={handleNewItemSubmit}>
            <input
              type="number"
              name="newId"
              min={maxId + 1}
              placeholder={String(maxId + 1)}
            />
          <button type="submit">Добавить элемент</button>
        </form>
      </div>
      <div className="panes">
        <div className="pane">
          <div className="pane-header">
            <h2>Доступные элементы</h2>
            <input
              className="search-input"
              placeholder="Фильтр по ID"
              value={leftFilter}
              onChange={(e) => setLeftFilter(e.target.value)}
            />
          </div>
          <div className="list" id="left-list">
            {leftComputedItems.map((id) => (
              <div
                key={id}
                className="item"
                onClick={() => handleAddToSelected(id)}
              >
                <span>ID: {id}</span>
                <button
                  type="button"
                  className="item-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToSelected(id);
                  }}
                >
                  Выбрать
                </button>
              </div>
            ))}
            <div ref={leftSentinelRef} />
            {leftLoading && <div className="list-status">Загрузка...</div>}
            {!leftLoading && leftComputedItems.length === 0 && (
              <div className="list-status">Нет элементов</div>
            )}
          </div>
        </div>
        <div className="pane">
          <div className="pane-header">
            <h2>Выбранные элементы</h2>
            <input
              className="search-input"
              placeholder="Фильтр по ID"
              value={rightFilter}
              onChange={(e) => setRightFilter(e.target.value)}
            />
          </div>
          <div className="list" id="right-list">
            {visibleSelected.map((id) => (
              <div
                key={id}
                className="item"
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(id)}
              >
                <span>ID: {id}</span>
                <div className="item-actions">
                  <span className="drag-hint">⇅</span>
                  <button
                    type="button"
                    className="item-button remove"
                    onClick={() => handleRemoveFromSelected(id)}
                  >
                    Убрать
                  </button>
                </div>
              </div>
            ))}
            <div ref={rightSentinelRef} />
            {visibleSelected.length === 0 && (
              <div className="list-status">Нет выбранных элементов</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

