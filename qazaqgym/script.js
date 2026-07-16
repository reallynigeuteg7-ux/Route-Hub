const STORAGE_KEY = "gymSubscriptions";

const form = document.getElementById("subscriptionForm");
const formTitle = document.getElementById("formTitle");
const subscriptionIdInput = document.getElementById("subscriptionId");
const externalIdInput = document.getElementById("externalId");
const fullNameInput = document.getElementById("fullName");
const dateFromInput = document.getElementById("dateFrom");
const dateToInput = document.getElementById("dateTo");
const visitsLeftInput = document.getElementById("visitsLeft");
const totalVisitsInput = document.getElementById("totalVisits");
const notesInput = document.getElementById("notes");
const resetBtn = document.getElementById("resetBtn");

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const tableBody = document.getElementById("subscriptionsTable");
const emptyStateTemplate = document.getElementById("emptyStateTemplate");

const totalCountEl = document.getElementById("totalCount");
const activeCountEl = document.getElementById("activeCount");
const soonCountEl = document.getElementById("soonCount");
const problemCountEl = document.getElementById("problemCount");

const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const excelImportInput = document.getElementById("excelImportInput");

let subscriptions = loadSubscriptions();

render();

form.addEventListener("submit", handleSubmit);
resetBtn.addEventListener("click", resetForm);
searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
exportBtn.addEventListener("click", exportJson);
importInput.addEventListener("change", importJson);
excelImportInput.addEventListener("change", importExcel);

function loadSubscriptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeAndSortSubscriptions(parsed);
  } catch {
    return [];
  }
}

function saveSubscriptions() {
  subscriptions = normalizeAndSortSubscriptions(subscriptions);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
}

function generateLocalId() {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDate(value) {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toISODate(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotMatch) {
      const [, d, m, y] = dotMatch;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return toISODate(parsed);
    }
  }

  if (typeof value === "number" && window.XLSX) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  return "";
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function addDays(dateStr, days) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function getStatus(item) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = item.dateTo ? new Date(item.dateTo) : null;
  if (endDate) endDate.setHours(0, 0, 0, 0);

  if (normalizeNumber(item.visitsLeft) <= 0) {
    return { key: "no_visits", label: "Без посещений" };
  }

  if (endDate && endDate < today) {
    return { key: "expired", label: "Истек" };
  }

  if (endDate) {
    const diff = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    if (diff <= 5) {
      return { key: "soon", label: "Скоро истекает" };
    }
  }

  return { key: "active", label: "Активен" };
}

function normalizeAndSortSubscriptions(items) {
  const prepared = (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: item.id || generateLocalId(),
      externalId:
        item.externalId === "" || item.externalId == null || Number.isNaN(Number(item.externalId))
          ? null
          : Number(item.externalId),
      fullName: String(item.fullName || "").trim(),
      dateFrom: normalizeDate(item.dateFrom),
      dateTo: normalizeDate(item.dateTo),
      visitsLeft: Math.max(0, normalizeNumber(item.visitsLeft, 0)),
      totalVisits: Math.max(1, normalizeNumber(item.totalVisits, 1)),
      notes: String(item.notes || "").trim(),
      createdAt: item.createdAt || new Date().toISOString(),
    }))
    .filter((item) => item.fullName);

  prepared.sort((a, b) => {
    if (a.externalId == null && b.externalId == null) {
      return a.fullName.localeCompare(b.fullName, "ru");
    }
    if (a.externalId == null) return 1;
    if (b.externalId == null) return -1;
    return a.externalId - b.externalId;
  });

  return prepared;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = statusFilter.value;

  const filtered = subscriptions.filter((item) => {
    const status = getStatus(item).key;
    const matchesSearch = item.fullName.toLowerCase().includes(query);
    const matchesFilter = filter === "all" ? true : status === filter;
    return matchesSearch && matchesFilter;
  });

  renderTable(filtered);
  renderStats();
}

function renderTable(items) {
  tableBody.innerHTML = "";

  if (!items.length) {
    tableBody.appendChild(emptyStateTemplate.content.cloneNode(true));
    return;
  }

  items.forEach((item) => {
    const status = getStatus(item);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${item.externalId ?? "—"}</strong></td>
      <td>
        <div class="client-name">${escapeHtml(item.fullName)}</div>
        <div class="client-notes">${escapeHtml(item.notes || "Без комментария")}</div>
      </td>
      <td>${formatDate(item.dateFrom)}</td>
      <td>${formatDate(item.dateTo)}</td>
      <td><strong>${item.visitsLeft}</strong> / ${item.totalVisits}</td>
      <td><span class="badge ${status.key}">${status.label}</span></td>
      <td>
        <div class="actions-cell">
          <button class="mini-btn primary" data-action="minus" data-id="${item.id}">-1 посещение</button>
          <button class="mini-btn" data-action="extend" data-id="${item.id}">Продлить +30 дн</button>
          <button class="mini-btn" data-action="edit" data-id="${item.id}">Изменить</button>
          <button class="mini-btn danger" data-action="delete" data-id="${item.id}">Удалить</button>
        </div>
      </td>
    `;

    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", handleRowAction);
  });
}

function renderStats() {
  const total = subscriptions.length;
  const active = subscriptions.filter((x) => getStatus(x).key === "active").length;
  const soon = subscriptions.filter((x) => getStatus(x).key === "soon").length;
  const problem = subscriptions.filter((x) => {
    const key = getStatus(x).key;
    return key === "expired" || key === "no_visits";
  }).length;

  totalCountEl.textContent = total;
  activeCountEl.textContent = active;
  soonCountEl.textContent = soon;
  problemCountEl.textContent = problem;
}

function handleSubmit(event) {
  event.preventDefault();

  const existingId = subscriptionIdInput.value.trim();
  const customExternalIdRaw = externalIdInput.value.trim();

  const item = {
    id: existingId || generateLocalId(),
    externalId: customExternalIdRaw ? Number(customExternalIdRaw) : null,
    fullName: fullNameInput.value.trim(),
    dateFrom: dateFromInput.value,
    dateTo: dateToInput.value,
    visitsLeft: Math.max(0, Number(visitsLeftInput.value)),
    totalVisits: Math.max(1, Number(totalVisitsInput.value)),
    notes: notesInput.value.trim(),
    createdAt: new Date().toISOString(),
  };

  if (!item.fullName || !item.dateFrom || !item.dateTo) return;

  const duplicate = subscriptions.find(
    (x) => x.externalId === item.externalId && x.id !== item.id && item.externalId != null
  );

  if (duplicate) {
    alert("Такой ID уже существует. Введи другой номер.");
    return;
  }

  const index = subscriptions.findIndex((x) => x.id === item.id);

  if (index >= 0) {
    subscriptions[index] = { ...subscriptions[index], ...item };
  } else {
    subscriptions.push(item);
  }

  saveSubscriptions();
  resetForm();
  render();
}

function resetForm() {
  form.reset();
  subscriptionIdInput.value = "";
  externalIdInput.value = "";
  formTitle.textContent = "Новый абонемент";
}

function handleRowAction(event) {
  const action = event.currentTarget.dataset.action;
  const id = event.currentTarget.dataset.id;

  const index = subscriptions.findIndex((item) => item.id === id);
  if (index < 0) return;

  if (action === "minus") {
    subscriptions[index].visitsLeft = Math.max(0, subscriptions[index].visitsLeft - 1);
  }

  if (action === "extend") {
    if (subscriptions[index].dateTo) {
      subscriptions[index].dateTo = addDays(subscriptions[index].dateTo, 30);
    }
  }

  if (action === "edit") {
    const item = subscriptions[index];
    subscriptionIdInput.value = item.id;
    externalIdInput.value = item.externalId ?? "";
    fullNameInput.value = item.fullName;
    dateFromInput.value = item.dateFrom;
    dateToInput.value = item.dateTo;
    visitsLeftInput.value = item.visitsLeft;
    totalVisitsInput.value = item.totalVisits;
    notesInput.value = item.notes || "";
    formTitle.textContent = `Редактирование #${item.externalId ?? ""}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "delete") {
    const ok = confirm("Удалить этот абонемент?");
    if (!ok) return;
    subscriptions.splice(index, 1);
  }

  saveSubscriptions();
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(subscriptions, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "abonements-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      subscriptions = normalizeAndSortSubscriptions(parsed);
      saveSubscriptions();
      render();
      resetForm();
      alert("JSON импортирован.");
    } catch {
      alert("Ошибка JSON-файла.");
    } finally {
      importInput.value = "";
    }
  };
  reader.readAsText(file);
}

function isRealVisitMark(cellValue) {
  if (cellValue === 1) return true;
  if (typeof cellValue === "string") {
    const cleaned = cellValue.trim().replace(/[`"' ]/g, "");
    return cleaned === "1";
  }
  return false;
}

function countUsedVisitsFromRow(row) {
  let count = 0;

  // E:P = индексы 4..15
  for (let i = 4; i <= 15; i++) {
    const cell = row[i];
    if (isRealVisitMark(cell)) {
      count++;
    }
  }

  return count;
}

function detectTotalVisitsFromName(fullName) {
  const text = String(fullName || "").toLowerCase();

  if (/\b16\b/.test(text)) {
    return 16;
  }

  return 12;
}

function cleanFullName(fullName) {
  return String(fullName || "")
    .replace(/\b16\b/g, "")
    .replace(/\b12\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!window.XLSX) {
    alert("Не загрузилась библиотека Excel.");
    excelImportInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array", cellDates: true });

      const allImported = [];
      const duplicateIds = new Set();

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
          raw: true,
        });

        rows.forEach((row, index) => {
          if (!Array.isArray(row) || row.length < 2) return;

          const rawId = row[0];
          const rawFullName = row[1];
          const rawDateFrom = row[2];
          const rawDateTo = row[3];

          const idText = String(rawId ?? "").trim();
          const nameText = String(rawFullName ?? "").trim();

          if (!idText && !nameText) return;

          // пропуск шапок
          const lowId = idText.toLowerCase();
          const lowName = nameText.toLowerCase();
          if (
            lowId === "id" ||
            lowId === "номер" ||
            lowId === "№" ||
            lowName.includes("фи") ||
            lowName.includes("клиент")
          ) {
            return;
          }

          const externalId = idText === "" ? null : Number(rawId);
          if (externalId == null || Number.isNaN(externalId)) return;
          if (!nameText) return;

          const totalVisits = detectTotalVisitsFromName(rawFullName);
          const usedVisits = countUsedVisitsFromRow(row);
          const visitsLeft = Math.max(0, totalVisits - usedVisits);

          const cleanedName = cleanFullName(rawFullName);

          allImported.push({
            id: generateLocalId() + "_" + sheetName + "_" + index,
            externalId,
            fullName: cleanedName,
            dateFrom: normalizeDate(rawDateFrom),
            dateTo: normalizeDate(rawDateTo),
            visitsLeft,
            totalVisits,
            notes: "",
            createdAt: new Date().toISOString(),
          });
        });
      });

      const seen = new Set();
      allImported.forEach((item) => {
        if (seen.has(item.externalId)) {
          duplicateIds.add(item.externalId);
        }
        seen.add(item.externalId);
      });

      subscriptions = normalizeAndSortSubscriptions(allImported);
      saveSubscriptions();
      render();
      resetForm();

      if (duplicateIds.size) {
        alert(
          "Excel импортирован, но найдены дубли ID: " +
            Array.from(duplicateIds).sort((a, b) => a - b).join(", ")
        );
      } else {
        alert("Excel импортирован. ID сохранены, посещения посчитаны по единицам.");
      }
    } catch (error) {
      console.error(error);
      alert("Ошибка при импорте Excel.");
    } finally {
      excelImportInput.value = "";
    }
  };

  reader.readAsArrayBuffer(file);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}