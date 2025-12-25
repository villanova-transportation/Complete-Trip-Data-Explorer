/* global L, SAMPLE */

(function () {
  // ---------- Map init ----------
  const map = L.map("map", { zoomControl: true }).setView([40.758, -111.89], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // Layers
  const layers = {
    od: L.layerGroup().addTo(map),
    tripRoute: L.layerGroup().addTo(map),
    accessEgress: L.layerGroup().addTo(map),
    busStops: L.layerGroup().addTo(map),
    railStops: L.layerGroup().addTo(map),
    busRoutes: L.layerGroup().addTo(map),
    railRoutes: L.layerGroup().addTo(map),
    tdi: L.geoJSON(null).addTo(map)
  };
  // ===== Facility Layer Groups =====
  const facilityLayers = {
    bus_stop: L.layerGroup().addTo(map),
    rail_stop: L.layerGroup().addTo(map),
    bus_route: L.layerGroup().addTo(map),
    rail_route: L.layerGroup().addTo(map)
  };
  async function loadStops() {
    const res = await fetch("data/UTA/UTA_Stops.geojson");
    const data = await res.json();

    facilityLayers.bus_stop.clearLayers();
    facilityLayers.rail_stop.clearLayers();

    L.geoJSON(data, {
      filter: feature => {
        const mode = feature.properties.mode; // ← 如果字段名不同，改这里
        return mode === "bus" || mode === "rail";
      },
      pointToLayer: (feature, latlng) => {
        const mode = feature.properties.mode;

        const layer = L.circleMarker(latlng, {
          radius: 4,
          color: mode === "bus" ? "#2563eb" : "#7c3aed",
          weight: 1,
          fillOpacity: 0.9
        });

        if (mode === "bus") {
          layer.addTo(facilityLayers.bus_stop);
        } else {
          layer.addTo(facilityLayers.rail_stop);
        }

        return layer;
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(feature.properties.stop_name || "Stop");
      }
    });
  }
  async function loadRoutes() {
    const res = await fetch("data/UTA/UTA_Routes.geojson");
    const data = await res.json();

    facilityLayers.bus_route.clearLayers();
    facilityLayers.rail_route.clearLayers();

    L.geoJSON(data, {
      filter: feature => {
        const mode = feature.properties.mode;
        return mode === "bus" || mode === "rail";
      },
      style: feature => ({
        color: feature.properties.mode === "bus" ? "#2563eb" : "#7c3aed",
        weight: 2,
        opacity: 0.6
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(feature.properties.route_name || "Route");

        if (feature.properties.mode === "bus") {
          layer.addTo(facilityLayers.bus_route);
        } else {
          layer.addTo(facilityLayers.rail_route);
        }
      }
    });
  }

  // ---------- DOM ----------
  const selMonth = document.getElementById("selMonth");
  const selOD = document.getElementById("selOD");
  const selMode = document.getElementById("selMode");
  const chkLinkedOnly = document.getElementById("chkLinkedOnly");

  const chkBusStops = document.getElementById("chkBusStops");
  const chkRailStops = document.getElementById("chkRailStops");
  const chkBusRoutes = document.getElementById("chkBusRoutes");
  const chkRailRoutes = document.getElementById("chkRailRoutes");

  const odSummary = document.getElementById("odSummary");
  const aeSummary = document.getElementById("aeSummary");
  const tripList = document.getElementById("tripList");

  const compareTable = document.getElementById("compareTable");

  const selTdiView = document.getElementById("selTdiView");
  const selTdiMonth = document.getElementById("selTdiMonth");
  const tdiLegend = document.getElementById("tdiLegend");

  // ---------- Tabs ----------
  const tabBtns = Array.from(document.querySelectorAll(".tab-btn"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      tabPanels.forEach(p => p.classList.remove("active"));
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");

      // When switching tabs, adjust what the map shows
      if (btn.dataset.tab === "tab-tdi") {
        drawTDI();
      } else {
        clearTDI();
        drawExplore(); // keep Explore visuals consistent
      }
    });
  });

  // ---------- Helpers ----------
  function fmtPct(x) {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    return `${Math.round(x * 100)}%`;
  }
  function fmtNum(x) {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    return x.toLocaleString();
  }
  function kv(el, rows) {
    el.innerHTML = rows.map(r => `
      <div class="row"><div class="k">${r.k}</div><div class="v">${r.v}</div></div>
    `).join("");
  }

  function getSelected() {
    return {
      month: selMonth.value,
      odId: selOD.value,
      mode: selMode.value,
      linkedOnly: chkLinkedOnly.checked
    };
  }

  function filterTrips() {
    const { month, odId, mode, linkedOnly } = getSelected();
    return SAMPLE.tripSamples.filter(t => {
      if (month && t.month !== month) return false;
      if (odId && t.odId !== odId) return false;
      if (linkedOnly && !t.linked) return false;
      if (mode && mode !== "ALL" && t.mode !== mode) return false;
      return true;
    });
  }

  function getOdSummaryRow() {
    const { month, odId } = getSelected();
    return SAMPLE.odMonthlySummary.find(r => r.month === month && r.odId === odId) || null;
  }

  // ---------- Populate selectors ----------
  function initSelectors() {
    // months
    selMonth.innerHTML = SAMPLE.months.map(m => `<option value="${m}">${m}</option>`).join("");
    // od
    selOD.innerHTML = SAMPLE.odPairs.map(o => `<option value="${o.odId}">${o.odId}</option>`).join("");
    // tdi month
    selTdiMonth.innerHTML = SAMPLE.months.map(m => `<option value="${m}">${m}</option>`).join("");

    // default
    selMonth.value = SAMPLE.months[0];
    selOD.value = SAMPLE.odPairs[0].odId;
    selMode.value = "ALL";
    chkLinkedOnly.checked = false;
  }

  // ---------- UTA overlay drawing ----------
  function drawUtaOverlays() {
    layers.busStops.clearLayers();
    layers.railStops.clearLayers();
    layers.busRoutes.clearLayers();
    layers.railRoutes.clearLayers();

    if (chkBusStops.checked) {
      SAMPLE.uta.busStops.forEach(s => {
        const m = L.circleMarker([s.lat, s.lng], {
          radius: 5,
          color: "#1E3A8A",
          weight: 2,
          fillOpacity: 0.7
        }).bindTooltip(`Bus Stop: ${s.name}`);
        layers.busStops.addLayer(m);
      });
    }

    if (chkRailStops.checked) {
      SAMPLE.uta.railStops.forEach(s => {
        const m = L.circleMarker([s.lat, s.lng], {
          radius: 6,
          color: "#32B5FF",
          weight: 2,
          fillOpacity: 0.8
        }).bindTooltip(`Rail Stop: ${s.name}`);
        layers.railStops.addLayer(m);
      });
    }

    if (chkBusRoutes.checked) {
      SAMPLE.uta.busRoutes.forEach(r => {
        const pl = L.polyline(r.coords, { color: "#1E3A8A", weight: 3, opacity: 0.75 })
          .bindTooltip(`Bus Route: ${r.name}`);
        layers.busRoutes.addLayer(pl);
      });
    }

    if (chkRailRoutes.checked) {
      SAMPLE.uta.railRoutes.forEach(r => {
        const pl = L.polyline(r.coords, { color: "#32B5FF", weight: 4, opacity: 0.75 })
          .bindTooltip(`Rail Route: ${r.name}`);
        layers.railRoutes.addLayer(pl);
      });
    }
  }

  // ---------- Explore drawing ----------
  function drawOdLine() {
    layers.od.clearLayers();
    // Minimal OD visualization: draw a straight line between two representative centroids (synthetic)
    // In real data: you will have zone centroids for each origin/dest.
    const odId = selOD.value;
    const centroid = {
      "Z01": [40.760, -111.905],
      "Z02": [40.760, -111.885],
      "Z03": [40.742, -111.875],
      "Z04": [40.742, -111.905],
      "Z05": [40.720, -111.855]
    };
    const parts = odId.split("→");
    const o = centroid[parts[0]] || [40.758, -111.90];
    const d = centroid[parts[1]] || [40.748, -111.87];

    const line = L.polyline([o, d], { color: "#0A2A66", weight: 5, opacity: 0.65 })
      .bindTooltip(`OD: ${odId}`);
    layers.od.addLayer(line);
  }

  function drawTripsList(trips) {
    tripList.innerHTML = "";
    if (!trips.length) {
      tripList.innerHTML = `<div class="small">No trips matched the filters.</div>`;
      return;
    }

    trips.slice(0, 12).forEach((t, idx) => {
      const el = document.createElement("div");
      el.className = "trip-item";
      el.dataset.tripId = t.tripId;
      el.innerHTML = `
        <div class="title">${t.tripId} ${t.linked ? '· <span style="color:#0A2A66;">Linked</span>' : ''}</div>
        <div class="meta">Mode: <b>${t.mode}</b> · Duration: <b>${t.durationMin} min</b></div>
        <div class="meta">Access: ${t.access.name} · Egress: ${t.egress.name}</div>
      `;
      el.addEventListener("click", () => {
        document.querySelectorAll(".trip-item").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        drawTripOnMap(t);
        updateAccessEgressPanel(t);
      });
      // Auto-select first on refresh
      if (idx === 0) setTimeout(() => el.click(), 0);
      tripList.appendChild(el);
    });
  }

  function updateSummaryPanels(summaryRow) {
    if (!summaryRow) {
      kv(odSummary, [
        { k: "Trips", v: "—" },
        { k: "Transit share", v: "—" },
        { k: "Linked share", v: "—" },
        { k: "Avg access (m)", v: "—" },
        { k: "Avg egress (m)", v: "—" }
      ]);
      kv(aeSummary, [
        { k: "Access", v: "—" },
        { k: "Egress", v: "—" }
      ]);
      return;
    }

    kv(odSummary, [
      { k: "Trips", v: fmtNum(summaryRow.trips) },
      { k: "Transit share", v: fmtPct(summaryRow.pctTransit) },
      { k: "Linked share", v: fmtPct(summaryRow.pctLinked) },
      { k: "Avg access (m)", v: fmtNum(summaryRow.avgAccessM) },
      { k: "Avg egress (m)", v: fmtNum(summaryRow.avgEgressM) }
    ]);
  }

  function updateAccessEgressPanel(trip) {
    kv(aeSummary, [
      { k: "Access", v: `${trip.access.type}: ${trip.access.name}` },
      { k: "Egress", v: `${trip.egress.type}: ${trip.egress.name}` },
      { k: "Segments", v: trip.segments.map(s => s.mode).join(" → ") }
    ]);
  }

  function drawTripOnMap(trip) {
    layers.tripRoute.clearLayers();
    layers.accessEgress.clearLayers();

    const route = L.polyline(trip.route, { color: "#0A2A66", weight: 4, opacity: 0.9 });
    layers.tripRoute.addLayer(route);

    // Access/Egress markers
    if (trip.access.type !== "NONE") {
      layers.accessEgress.addLayer(
        L.circleMarker([trip.access.lat, trip.access.lng], {
          radius: 7, color: "#1E3A8A", weight: 2, fillOpacity: 0.85
        }).bindTooltip(`Access: ${trip.access.name}`)
      );
    }
    if (trip.egress.type !== "NONE") {
      layers.accessEgress.addLayer(
        L.circleMarker([trip.egress.lat, trip.egress.lng], {
          radius: 7, color: "#32B5FF", weight: 2, fillOpacity: 0.85
        }).bindTooltip(`Egress: ${trip.egress.name}`)
      );
    }

    map.fitBounds(route.getBounds(), { padding: [30, 30] });
  }

  function drawExplore() {
    drawOdLine();
    drawUtaOverlays();

    const summaryRow = getOdSummaryRow();
    updateSummaryPanels(summaryRow);

    const trips = filterTrips();
    drawTripsList(trips);

    // if no trip selected, clear route layers
    if (!trips.length) {
      layers.tripRoute.clearLayers();
      layers.accessEgress.clearLayers();
    }
  }

  // ---------- Compare ----------
  function renderCompare() {
    const cs = SAMPLE.compareStats;
    // 3 columns: CompleteTrip, USDOT, UTA
    const blocks = [
      { key:"CompleteTrip", title:"Complete Trip", note:"Trip-level LBS reconstructed" },
      { key:"USDOT", title:"USDOT", note:"Reference summary placeholder" },
      { key:"UTA", title:"UTA", note:"Agency GTFS/ops proxy" }
    ];

    compareTable.innerHTML = blocks.map(b => {
      const s = cs[b.key];
      return `
        <div class="compare-cell">
          <div class="hdr">${b.title}</div>
          <div class="val">${fmtNum(s.trips)}</div>
          <div class="sub">Trips (aggregate)</div>
          <div class="sub">Transit share: <b>${fmtPct(s.transitShare)}</b></div>
          <div class="sub">Linked share: <b>${fmtPct(s.linkedShare)}</b></div>
          <div class="sub">Avg access: <b>${fmtNum(s.avgAccessM)} m</b></div>
          <div class="sub" style="margin-top:6px;color:#555;">${b.note}</div>
        </div>
      `;
    }).join("");
  }

  // ---------- TDI ----------
  function tdiColor(v) {
    // Simple diverging bins (synthetic). Replace with your scheme.
    if (v >= 2.0) return "#08306b";
    if (v >= 1.0) return "#2171b5";
    if (v >= 0.3) return "#6baed6";
    if (v >= -0.3) return "#bdd7e7";
    return "#f7fbff";
  }

  function buildLegend() {
    const bins = [
      { label: ">= 2.0 (High desert)", color: "#08306b" },
      { label: "1.0 – 2.0", color: "#2171b5" },
      { label: "0.3 – 1.0", color: "#6baed6" },
      { label: "-0.3 – 0.3", color: "#bdd7e7" },
      { label: "< -0.3 (Low/negative)", color: "#f7fbff" }
    ];
    tdiLegend.innerHTML = bins.map(b => `
      <div class="box"><span class="swatch" style="background:${b.color}"></span>${b.label}</div>
    `).join("");
  }

  function clearTDI() {
    layers.tdi.clearLayers();
  }

  function drawTDI() {
    // Keep UTA overlays optional; but typically TDI map should be clean.
    layers.tripRoute.clearLayers();
    layers.accessEgress.clearLayers();
    layers.od.clearLayers();

    // Show a consistent area
    map.setView([40.753, -111.895], 12);

    const view = selTdiView.value;
    const month = selTdiMonth.value;

    layers.tdi.clearLayers();

    const geo = SAMPLE.tdiGeo;
    layers.tdi = L.geoJSON(geo, {
      style: (feature) => {
        const p = feature.properties;
        const v = (view === "ANNUAL") ? p.annual : (p.monthly?.[month] ?? 0);
        return {
          color: "#1E3A8A",
          weight: 1,
          fillColor: tdiColor(v),
          fillOpacity: 0.75
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const v = (view === "ANNUAL") ? p.annual : (p.monthly?.[month] ?? 0);
        layer.bindTooltip(`Zone: ${p.zone}<br>TDI: <b>${v.toFixed(2)}</b>`, { sticky: true });
      }
    }).addTo(map);

    buildLegend();
  }

  // ---------- Events ----------
  function attachEvents() {
    [selMonth, selOD, selMode, chkLinkedOnly].forEach(el => {
      el.addEventListener("change", () => {
        // If currently in TDI tab, stay there; else redraw explore
        const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
        if (activeTab === "tab-tdi") drawTDI();
        else drawExplore();
      });
    });

    [chkBusStops, chkRailStops, chkBusRoutes, chkRailRoutes].forEach(el => {
      el.addEventListener("change", () => {
        drawUtaOverlays();
      });
    });

    selTdiView.addEventListener("change", drawTDI);
    selTdiMonth.addEventListener("change", drawTDI);
  }
  // ===== Initial load =====
  loadStops();
  loadRoutes();

  // ---------- Init ----------
  function init() {
    initSelectors();
    attachEvents();
    renderCompare();
    drawExplore();
  }

  init();

})();
