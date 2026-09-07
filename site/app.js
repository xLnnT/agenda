/* Agenda — statische weergave van site/events.json */
(function () {
  "use strict";

  const HOUR_PX = 52;
  const LIST_DAYS = 30;
  const MAX_PER_DAY = 3;
  const STORAGE_KEY = "agenda:hidden";
  const DAYS_SHORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const DAYS_MID = ["maa", "din", "woe", "don", "vri", "zat", "zon"];
  const DAYS_LONG = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
  const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const MONTHS_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  const app = document.getElementById("app");
  const title = app.dataset.title || "Agenda";

  const state = {
    view: window.matchMedia("(max-width: 767px)").matches ? "list" : "week",
    cursor: new Date(),
    hidden: loadHidden(),
    data: null,
    events: [],
    selected: null,
    error: null,
  };

  /* ---------- datumhulpjes ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dow = (d) => (d.getDay() + 6) % 7; // maandag = 0
  const startOfWeek = (d) => addDays(startOfDay(d), -dow(d));
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isToday = (d) => isSameDay(d, new Date());
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtLong = (d) => `${DAYS_LONG[dow(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const fmtShort = (d) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;

  function parseLocalDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function loadHidden() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return new Set(v ? JSON.parse(v) : []);
    } catch {
      return new Set();
    }
  }
  function saveHidden() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.hidden]));
    } catch {
      /* negeren */
    }
  }

  /* ---------- events ---------- */
  function prepareEvents(data) {
    const byId = new Map(data.calendars.map((c) => [c.id, c]));
    return data.events.flatMap((ev) => {
      const cal = byId.get(ev.calendarId);
      if (!cal) return [];
      return [{
        ...ev,
        startDate: ev.allDay ? parseLocalDate(ev.start) : new Date(ev.start),
        endDate: ev.allDay ? parseLocalDate(ev.end) : new Date(ev.end),
        color: cal.color,
        calendarName: cal.name,
      }];
    });
  }

  function visibleEvents() {
    return state.events.filter((e) => !state.hidden.has(e.calendarId));
  }

  function eventsOnDay(events, day) {
    const s = startOfDay(day);
    const e = addDays(s, 1);
    return events.filter((ev) => ev.startDate < e && ev.endDate > s);
  }

  function sortEvents(events) {
    return [...events].sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startDate - b.startDate || b.endDate - a.endDate;
    });
  }

  /** Overlappende tijdafspraken naast elkaar in kolommen zetten. */
  function layoutDay(events, day) {
    const dayStart = startOfDay(day).getTime();
    const items = events
      .filter((e) => !e.allDay)
      .map((event) => {
        const top = Math.max(0, (event.startDate - dayStart) / 60000);
        const bottom = Math.min(1440, (event.endDate - dayStart) / 60000);
        return { event, top, bottom: Math.max(bottom, top + 20), col: 0, cols: 1 };
      })
      .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

    const result = [];
    let cluster = [];
    let columnsEnd = [];
    let clusterEnd = -1;
    const flush = () => {
      for (const it of cluster) it.cols = columnsEnd.length;
      result.push(...cluster);
      cluster = [];
      columnsEnd = [];
    };
    for (const it of items) {
      if (cluster.length && it.top >= clusterEnd) flush();
      let col = columnsEnd.findIndex((end) => end <= it.top);
      if (col === -1) {
        col = columnsEnd.length;
        columnsEnd.push(it.bottom);
      } else {
        columnsEnd[col] = it.bottom;
      }
      it.col = col;
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.bottom);
    }
    flush();
    return result;
  }

  /* ---------- bereik & labels ---------- */
  function range() {
    const c = state.cursor;
    if (state.view === "week") {
      const from = startOfWeek(c);
      return { from, to: addDays(from, 7) };
    }
    if (state.view === "month") {
      const from = startOfWeek(startOfMonth(c));
      const to = addDays(startOfWeek(endOfMonth(c)), 7);
      return { from, to };
    }
    const from = startOfDay(c);
    return { from, to: addDays(from, LIST_DAYS) };
  }

  function periodLabel() {
    const c = state.cursor;
    if (state.view === "month") return `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    const { from, to } = range();
    const last = addDays(to, -1);
    if (state.view === "list") return `${fmtShort(from)} – ${fmtShort(last)} ${last.getFullYear()}`;
    if (from.getMonth() === last.getMonth()) return `${from.getDate()} – ${last.getDate()} ${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
    return `${fmtShort(from)} – ${fmtShort(last)} ${last.getFullYear()}`;
  }

  function periodKey() {
    const { from } = range();
    return `${state.view}:${dayKey(from)}`;
  }

  /* ---------- render ---------- */
  function chip(ev, day) {
    const continues = day && !ev.allDay && ev.startDate < startOfDay(day);
    const time = ev.allDay ? "" : `<span class="time">${continues ? "…" : fmtTime(ev.startDate)}</span>`;
    return `<button class="chip" data-ev="${esc(ev.id)}" title="${esc(ev.title)}" style="background:${ev.color}22;color:${ev.color}">
      <span class="dot" style="background:${ev.color}"></span>${time}<span class="name">${esc(ev.title)}</span></button>`;
  }

  function renderHeader() {
    const views = [["week", "Week"], ["month", "Maand"], ["list", "Lijst"]];
    const legend = state.data.calendars.map((cal) => {
      const off = state.hidden.has(cal.id);
      return `<button class="${off ? "off" : ""}" data-action="toggle" data-cal="${esc(cal.id)}" aria-pressed="${!off}" style="background:${cal.color}22">
        <span class="dot" style="background:${off ? "transparent" : cal.color};box-shadow:inset 0 0 0 1.5px ${cal.color}"></span>${esc(cal.name)}</button>`;
    }).join("");
    return `<header class="header">
      <h1 class="title">${esc(title)}</h1>
      <div class="nav">
        <button class="nav-arrow" data-action="prev" aria-label="Vorige">‹</button>
        <button class="btn" data-action="today">Vandaag</button>
        <button class="nav-arrow" data-action="next" aria-label="Volgende">›</button>
      </div>
      <span class="period">${esc(periodLabel())}</span>
      <div class="views">${views.map(([v, l]) => `<button class="${state.view === v ? "active" : ""}" data-action="view" data-view="${v}">${l}</button>`).join("")}</div>
      <div class="legend">${legend}</div>
    </header>`;
  }

  function renderWarning() {
    if (state.error) return `<div class="warn">Kon de agenda niet laden: ${esc(state.error)}</div>`;
    const failed = (state.data.errors || []).map((e) => state.data.calendars.find((c) => c.id === e.calendarId)?.name || e.calendarId);
    if (!failed.length) return "";
    return `<div class="warn">Kon niet ophalen: ${esc(failed.join(", "))}</div>`;
  }

  function renderWeek(events) {
    const { from } = range();
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    const perDay = days.map((day) => {
      const all = eventsOnDay(events, day);
      return { day, allDay: sortEvents(all.filter((e) => e.allDay)), timed: layoutDay(all, day) };
    });
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const head = `<div class="cols week-days"><div></div>${days.map((d) => `
      <div class="week-day"><span class="dow">${DAYS_MID[dow(d)]}</span><span class="daynum ${isToday(d) ? "today" : ""}">${d.getDate()}</span></div>`).join("")}</div>`;

    const hasAllDay = perDay.some((d) => d.allDay.length);
    const allDayRow = hasAllDay ? `<div class="cols week-allday"><div class="label">hele<br>dag</div>${perDay.map(({ allDay }) =>
      `<div class="cell">${allDay.map((ev) => chip(ev)).join("")}</div>`).join("")}</div>` : "";

    const hours = Array.from({ length: 24 }, (_, h) => h);
    const hourLabels = hours.map((h) => h ? `<div class="hour-label" style="top:${h * HOUR_PX}px">${pad(h)}:00</div>` : "").join("");

    const cols = perDay.map(({ day, timed }) => {
      const lines = hours.map((h) => `<div class="hour-line" style="top:${h * HOUR_PX}px"></div>`).join("");
      const evs = timed.map(({ event, top, bottom, col, cols }) => {
        const width = 100 / cols;
        const height = ((bottom - top) / 60) * HOUR_PX;
        const continues = event.startDate < startOfDay(day);
        return `<button class="tevent" data-ev="${esc(event.id)}" title="${esc(event.title)}" style="top:${(top / 60) * HOUR_PX + 1}px;height:${Math.max(height - 2, 18)}px;left:calc(${col * width}% + 2px);width:calc(${width}% - 4px);background:${event.color}26;border-color:${event.color};z-index:${10 + col}">
          <div class="t">${esc(event.title)}</div>
          ${height > 30 ? `<div class="s" style="color:${event.color}">${continues ? "…" : fmtTime(event.startDate)} – ${fmtTime(event.endDate)}</div>` : ""}
          ${height > 44 && event.location ? `<div class="l">${esc(event.location)}</div>` : ""}
        </button>`;
      }).join("");
      const nowLine = isToday(day) ? `<div class="nowline" style="top:${(nowMin / 60) * HOUR_PX}px"></div>` : "";
      return `<div class="daycol ${isToday(day) ? "today" : ""}">${lines}${evs}${nowLine}</div>`;
    }).join("");

    return `<div class="panel week"><div class="week-inner">
      <div class="week-head">${head}${allDayRow}</div>
      <div class="cols week-grid" style="height:${24 * HOUR_PX}px"><div class="hours">${hourLabels}</div>${cols}</div>
    </div></div>`;
  }

  function renderMonth(events) {
    const month = state.cursor;
    const { from, to } = range();
    const days = [];
    for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
    const head = `<div class="month-head">${DAYS_SHORT.map((d) => `<div>${d}</div>`).join("")}</div>`;
    const cells = days.map((day) => {
      const inMonth = day.getMonth() === month.getMonth();
      const dayEvents = sortEvents(eventsOnDay(events, day));
      const shown = dayEvents.slice(0, MAX_PER_DAY);
      const extra = dayEvents.length - shown.length;
      return `<div class="mday ${inMonth ? "" : "out"}">
        <button class="daynum ${isToday(day) ? "today" : ""}" data-action="day" data-day="${dayKey(day)}">${day.getDate()}</button>
        ${shown.map((ev) => chip(ev, day)).join("")}
        ${extra > 0 ? `<button class="more" data-action="day" data-day="${dayKey(day)}">+${extra} meer</button>` : ""}
      </div>`;
    }).join("");
    return `<div class="panel month">${head}<div class="month-grid">${cells}</div></div>`;
  }

  function renderList(events) {
    const { from } = range();
    const groups = [];
    for (let i = 0; i < LIST_DAYS; i++) {
      const day = addDays(from, i);
      const evs = sortEvents(eventsOnDay(events, day));
      if (evs.length) groups.push({ day, evs });
    }
    if (!groups.length) return `<div class="list"><div class="empty">Geen afspraken in deze periode.</div></div>`;
    return `<div class="list">${groups.map(({ day, evs }) => {
      const today = isToday(day);
      const items = evs.map((ev) => {
        const before = ev.startDate < day;
        const after = ev.endDate > addDays(day, 1);
        const when = ev.allDay ? "hele dag" : `${before ? "…" : fmtTime(ev.startDate)} – ${after ? "…" : fmtTime(ev.endDate)}`;
        return `<li><button data-ev="${esc(ev.id)}">
          <span class="dot" style="background:${ev.color}"></span>
          <span class="when">${when}</span>
          <span class="what"><span class="t">${esc(ev.title)}</span>${ev.location ? `<span class="l">${esc(ev.location)}</span>` : ""}</span>
        </button></li>`;
      }).join("");
      return `<section>
        <h3><span class="${today ? "pill" : ""}">${fmtLong(day)}</span>${today ? "<small>vandaag</small>" : ""}</h3>
        <ul class="panel">${items}</ul>
      </section>`;
    }).join("")}</div>`;
  }

  function describeWhen(ev) {
    const y = (d) => d.getFullYear();
    if (ev.allDay) {
      const last = addDays(ev.endDate, -1);
      if (isSameDay(ev.startDate, last)) return `${fmtLong(ev.startDate)} ${y(ev.startDate)} · hele dag`;
      return `${fmtShort(ev.startDate)} – ${fmtShort(last)} ${y(last)} · hele dag`;
    }
    if (isSameDay(ev.startDate, ev.endDate)) {
      return `${fmtLong(ev.startDate)} ${y(ev.startDate)} · ${fmtTime(ev.startDate)} – ${fmtTime(ev.endDate)}`;
    }
    return `${fmtShort(ev.startDate)} ${fmtTime(ev.startDate)} – ${fmtShort(ev.endDate)} ${y(ev.endDate)} ${fmtTime(ev.endDate)}`;
  }

  function renderModal() {
    const ev = state.selected;
    if (!ev) return "";
    return `<div class="overlay" data-action="close">
      <div class="dialog" role="dialog" aria-modal="true">
        <span class="dot" style="background:${ev.color}"></span>
        <div class="body">
          <h2>${esc(ev.title)}</h2>
          <p>${esc(describeWhen(ev))}</p>
          ${ev.location ? `<p>📍 ${esc(ev.location)}</p>` : ""}
          <div class="cal">${esc(ev.calendarName)}</div>
        </div>
        <button class="close" data-action="close" aria-label="Sluiten">✕</button>
      </div>
    </div>`;
  }

  let lastPeriod = null;

  function render() {
    if (!state.data) {
      app.innerHTML = `<div class="loading">${state.error ? esc(state.error) : "laden…"}</div>`;
      return;
    }
    const scroller = app.querySelector(".week, .month-grid, .list");
    const keepScroll = lastPeriod === periodKey() ? scroller?.scrollTop : null;

    const events = visibleEvents();
    const body = state.view === "week" ? renderWeek(events) : state.view === "month" ? renderMonth(events) : renderList(events);
    app.innerHTML = `${renderHeader()}${renderWarning()}<main>${body}</main>${renderModal()}`;

    const next = app.querySelector(".week, .month-grid, .list");
    if (next) {
      if (keepScroll != null) next.scrollTop = keepScroll;
      else if (state.view === "week") next.scrollTop = 7.5 * HOUR_PX;
    }
    lastPeriod = periodKey();
  }

  /* ---------- interactie ---------- */
  app.addEventListener("click", (e) => {
    const evBtn = e.target.closest("[data-ev]");
    if (evBtn) {
      state.selected = state.events.find((ev) => ev.id === evBtn.dataset.ev) || null;
      render();
      return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "close" && btn !== e.target && !btn.classList.contains("close")) return;
    switch (btn.dataset.action) {
      case "prev":
      case "next": {
        const dir = btn.dataset.action === "next" ? 1 : -1;
        if (state.view === "week") state.cursor = addDays(state.cursor, 7 * dir);
        else if (state.view === "month") state.cursor = addMonths(state.cursor, dir);
        else state.cursor = addDays(state.cursor, LIST_DAYS * dir);
        break;
      }
      case "today":
        state.cursor = new Date();
        break;
      case "view":
        state.view = btn.dataset.view;
        break;
      case "toggle": {
        const id = btn.dataset.cal;
        if (state.hidden.has(id)) state.hidden.delete(id);
        else state.hidden.add(id);
        saveHidden();
        break;
      }
      case "day":
        state.cursor = parseLocalDate(btn.dataset.day);
        state.view = "list";
        break;
      case "close":
        state.selected = null;
        break;
    }
    render();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.selected) {
      state.selected = null;
      render();
    }
  });

  setInterval(() => {
    if (state.view === "week" && !state.selected) render();
  }, 60000);

  /* ---------- laden ---------- */
  render();
  fetch("events.json", { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      state.data = data;
      state.events = prepareEvents(data);
      render();
    })
    .catch((err) => {
      state.error = err.message;
      render();
    });
})();
