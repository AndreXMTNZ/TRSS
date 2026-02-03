import { db } from "../firebase-init.js";
import {
  ref, onValue, get, push, set, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const el = (id) => document.getElementById(id);

const tripSelect = el("tripSelect");
const tripInfo = el("tripInfo");
const codeInput = el("code");
const directionSelect = el("direction");
const btnRegister = el("btnRegister");

const preview = el("preview");
const statusEl = el("status");
const listEl = el("list");
const todayLabel = el("todayLabel");
const tripLabel = el("tripLabel");

let passengersCache = {};
let tripsCache = {};
let todayAttendanceForTrip = {};

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function avatar(url) {
  return url?.trim() ? url.trim() : "https://i.pravatar.cc/150?img=1";
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function tripNiceLabel(t, fallback = "") {
  const dir = (t?.directionHint || "").trim();
  const from = (t?.from || "").trim();
  const to = (t?.to || "").trim();
  if (dir && from && to) return `${dir} · ${from} → ${to}`;
  return (t?.label || fallback || "").trim();
}

function renderTripInfo(tripId) {
  if (!tripId) {
    tripInfo.classList.add("hidden");
    tripInfo.innerHTML = "";
    return;
  }
  const t = tripsCache[tripId] || {};
  const dir = (t.directionHint || "").toUpperCase();
  const from = t.from || "Origen";
  const to = t.to || "Destino";
  const label = tripNiceLabel(t, tripId);

  tripInfo.classList.remove("hidden");
  tripInfo.innerHTML = `
    <span class="tripBadge">${dir || "RUTA"}</span>
    <div class="tripText">
      <strong>${from} → ${to}</strong>
      <small>${label}</small>
    </div>
  `;
}

function showPreview(p) {
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <img class="avatar" src="${avatar(p.photoURL)}" alt="foto">
    <div>
      <h3>${p.name || ""} <span class="tag">${(p.code || "").toUpperCase()}</span></h3>
      <p>Doc: ${p.doc || ""} · Estado: ${p.active ? "Activo" : "Inactivo"}</p>
    </div>
  `;
}

function hidePreview() {
  preview.classList.add("hidden");
  preview.innerHTML = "";
}

async function findPassengerByCode(code) {
  const codeNorm = code.trim().toUpperCase();
  if (!codeNorm) return null;

  const snap = await get(ref(db, `codes/${codeNorm}`));
  if (!snap.exists()) return null;

  const pid = snap.val();
  const psnap = await get(ref(db, `passengers/${pid}`));
  if (!psnap.exists()) return null;

  return { id: pid, ...psnap.val() };
}

function fmtLocal(ts) {
  if (!ts || typeof ts !== "number") return "—";
  return new Date(ts).toLocaleString();
}

function renderList() {
  const rows = Object.entries(todayAttendanceForTrip || {})
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (!rows.length) {
    listEl.innerHTML = `<div class="muted">Aún no hay registros hoy para este viaje.</div>`;
    return;
  }

  listEl.innerHTML = rows.map(r => {
    const p = passengersCache[r.passengerId] || {};
    const name = p.name || "(Sin nombre)";
    const when = fmtLocal(r.timestamp);
    return `
      <div class="item">
        <div class="itemLeft">
          <img class="avatar" src="${avatar(p.photoURL)}" alt="foto">
          <div>
            <strong>${name}</strong>
            <small>${(r.code || "").toUpperCase()} · ${when}</small>
          </div>
        </div>
        <span class="tag">${r.direction || ""}</span>
      </div>
    `;
  }).join("");
}

/* -------- CACHÉ PASAJEROS -------- */
onValue(ref(db, "passengers"), (snap) => {
  passengersCache = snap.val() || {};
});

/* -------- FECHA DE HOY -------- */
const today = dateKey(new Date());
todayLabel.textContent = today;

/* ✅ Evitar listeners duplicados */
let unsubscribeAttendance = null;

/* -------- CARGA TRIPS -------- */
onValue(ref(db, "trips"), (snap) => {
  tripsCache = snap.val() || {};

  const options = Object.entries(tripsCache)
    .filter(([_, t]) => t && t.active)
    .map(([id, t]) => ({ id, label: tripNiceLabel(t, id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  tripSelect.innerHTML = options.length
    ? options.map(o => `<option value="${o.id}">${o.label}</option>`).join("")
    : `<option value="">No hay rutas (importa el JSON)</option>`;

  onTripChange();
});

tripSelect.addEventListener("change", onTripChange);

function onTripChange() {
  const tripId = tripSelect.value;

  renderTripInfo(tripId);

  const label = tripNiceLabel(tripsCache[tripId], tripId);
  tripLabel.textContent = label ? `Mostrando: ${label}` : "";

  const hint = (tripsCache[tripId]?.directionHint || "").toUpperCase();
  if (hint === "IDA" || hint === "VUELTA") {
    directionSelect.value = hint;
  }

  todayAttendanceForTrip = {};
  renderList();

  if (!tripId) {
    setStatus("Selecciona una ruta (trip).");
    return;
  }

  if (typeof unsubscribeAttendance === "function") {
    unsubscribeAttendance();
  }

  unsubscribeAttendance = onValue(ref(db, `attendance/${today}/${tripId}`), (snap) => {
    todayAttendanceForTrip = snap.val() || {};
    renderList();
  });

  setStatus(`Ruta seleccionada: ${label}`);
}

/* -------- REGISTRAR -------- */
btnRegister.addEventListener("click", async () => {
  let tripId = tripSelect.value;
  const code = codeInput.value.trim().toUpperCase();

  if (!tripId) { setStatus("Selecciona una ruta (trip)."); return; }
  if (!code) { setStatus("Ingresa un código."); return; }

  setStatus("Buscando pasajero...");
  hidePreview();

  const passenger = await findPassengerByCode(code);

  if (!passenger) {
    setStatus("Código no encontrado.");
    return;
  }

  // si tiene ruta por defecto, se selecciona automáticamente
  if (passenger.defaultTrip && passenger.defaultTrip !== tripId) {
    tripSelect.value = passenger.defaultTrip;
    tripSelect.dispatchEvent(new Event("change"));
    tripId = passenger.defaultTrip;
  }

  showPreview(passenger);

  if (!passenger.active) {
    setStatus("Este pasajero está INACTIVO. No se registró.");
    return;
  }

  const hint = (tripsCache[tripId]?.directionHint || "").toUpperCase();
  const direction = (hint === "IDA" || hint === "VUELTA") ? hint : directionSelect.value;

  const recordRef = push(ref(db, `attendance/${today}/${tripId}`));
  await set(recordRef, {
    passengerId: passenger.id,
    code: passenger.code,
    direction,
    timestamp: serverTimestamp()
  });

  const label = tripNiceLabel(tripsCache[tripId], tripId);
  setStatus(`Registrado: ${passenger.name} (${direction}) · ${label}`);

  codeInput.value = "";
  codeInput.focus();
});
