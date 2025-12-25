/* global L, SAMPLE */

(function () {

  /* =========================
     Map init
  ========================= */
  const map = L.map("map", { zoomControl: true })
    .setView([40.758, -111.89], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  const baseMaps = {
    light: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO" }
    ),
    dark: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO" }
    )
  };
  function switchBasemap(name) {
    if (name === currentBasemap) return;

    Object.values(baseMaps).forEach(l => map.removeLayer(l));
    baseMaps[name].addTo(map);
    currentBasemap = name;

    // UI state
    document.querySelectorAll(".bm-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.basemap === name);
    });
  }

  // 默认底图
  baseMaps.light.addTo(map);
  let currentBasemap = "light";

  function normalizeStopMode(mode) {
    if (!mode) return null;

    const m = mode.toLowerCase();

    if (m.includes("bus") || m.includes("micro")) return "bus";
    if (m.includes("trax") || m.includes("frontrunner")) return "rail";

    return null;
  }
  function normalizeRouteMode(routeType) {
    if (!routeType) return null;

    const railLines = [
      "blue line",
      "red line",
      "green line",
      "s line",
      "frontrunner"
    ];

    const t = routeType.toLowerCase();

    if (railLines.some(r => t.includes(r))) return "rail";
    return "bus";
  }

  /* =========================
     Core layers (Explorer / TDI)
  ========================= */
  const layers = {
    od: L.layerGroup().addTo(map),
    tripRoute: L.layerGroup().addTo(map),
    accessEgress: L.layerGroup().addTo(map),
    tdi: L.geoJSON(null).addTo(map)
  };

  /* =========================
     Facility layers (GeoJSON only)
  ========================= */
  const facilityLayers = {
    bus_stop: L.layerGroup().addTo(map),
    rail_stop: L.layerGroup().addTo(map),
    bus_route: L.layerGroup().addTo(map),
    rail_route: L.layerGroup().addTo(map)
  };

  /* =========================
     Load facilities
  ========================= */
  async function loadStops() {
    const res = await fetch("data/UTA/UTA_Stops.geojson");
    const data = await res.json();

    facilityLayers.bus_stop.clearLayers();
    facilityLayers.rail_stop.clearLayers();

    L.geoJSON(data, {
      pointToLayer: (f, latlng) => {
        const mode = normalizeStopMode(f.properties.mode);
        if (!mode) return null;

        const layer = L.circleMarker(latlng, {
          radius: 4,
          color: mode === "bus" ? "#2563eb" : "#7c3aed",
          weight: 1,
          fillOpacity: 0.9
        });

        layer.bindPopup(
          `${f.properties.stop_name}<br><small>${f.properties.mode}</small>`
        );

        if (mode === "bus") layer.addTo(facilityLayers.bus_stop);
        if (mode === "rail") layer.addTo(facilityLayers.rail_stop);


        return layer;
      }
    });
  }

  async function loadRoutes() {
    const res = await fetch("data/UTA/UTA_Routes.geojson");
    const data = await res.json();

    facilityLayers.bus_route.clearLayers();
    facilityLayers.rail_route.clearLayers();

    L.geoJSON(data, {
      style: f => ({
        color: f.properties.mode === "bus" ? "#2563eb" : "#7c3aed",
        weight: 2,
        opacity: 0.6
      }),
      onEachFeature: (f, layer) => {
        layer.bindPopup(f.properties.route_name || "Route");

        const mode = normalizeRouteMode(f.properties.routetype);
        if (!mode) return;

        layer.bindPopup(
          `${f.properties.route_name}<br><small>${f.properties.routetype}</small>`
        );

        if (mode === "bus") layer.addTo(facilityLayers.bus_route);
        if (mode === "rail") layer.addTo(facilityLayers.rail_route);

      }
    });
  }
  let SAMPLE = [];

  async function loadSamples() {
    const res = await fetch("data/samples/samples.json");
    console.log("sample fetch status:", res.status);
  
    const json = await res.json();
    console.log("sample json:", json);
  
    SAMPLE = json.samples;
    console.log("SAMPLE length:", SAMPLE.length);
  }
  function attachViewPillEvents() {
    const pills = document.querySelectorAll(".view-pill");
    const samplePanel = document.getElementById("samples-panel");
  
    pills.forEach(pill => {
      pill.addEventListener("click", () => {
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
  
        const view = pill.dataset.view;
  
        // 目前只实现 Samples
        if (view === "samples") {
          samplePanel.style.display = "block";
          renderSampleList();   // 👈 关键
        } else {
          samplePanel.style.display = "none";
        }
      });
    });
  }
  /* =========================
     Checkbox → layer toggle
  ========================= */
  document
    .querySelectorAll('input[type="checkbox"][data-layer]')
    .forEach(cb => {
      cb.addEventListener("change", e => {
        const layer = facilityLayers[e.target.dataset.layer];
        if (!layer) return;

        if (e.target.checked) map.addLayer(layer);
        else map.removeLayer(layer);
      });
    });

  /* =========================
     Explorer logic（原样保留）
     ↓↓↓ 以下基本是你原来的代码 ↓↓↓
  ========================= */

  // 这里只示意：你原来的 drawExplore / drawTripOnMap / TDI 等
  // 完全不用动，只是不要再调用 drawUtaOverlays

  /* =========================
     Init
  ========================= */
  async function init() {
    await loadSamples();
    await loadStops();
    await loadRoutes();

    // 默认全选（如果 HTML 里 checked）
    Object.values(facilityLayers).forEach(l => map.addLayer(l));

    // 你原来的初始化
    // initSelectors();
    // attachEvents();
    // renderCompare();
    // drawExplore();
    attachViewPillEvents();
    document.querySelectorAll(".bm-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        switchBasemap(btn.dataset.basemap);
      });
    });
  }

  init();

})();
