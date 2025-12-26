/* global L */
let currentViewBounds = null;
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

  let currentBasemap = "light";
  baseMaps.light.addTo(map);

  function switchBasemap(name) {
    if (name === currentBasemap) return;

    Object.values(baseMaps).forEach(l => map.removeLayer(l));
    baseMaps[name].addTo(map);
    currentBasemap = name;

    document.querySelectorAll(".bm-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.basemap === name);
    });
  }

  /* =========================
     Mode helpers
  ========================= */
  function normalizeStopMode(mode) {
    if (!mode) return null;
    const m = mode.toLowerCase();
    if (m.includes("bus") || m.includes("micro")) return "bus";
    if (m.includes("trax") || m.includes("frontrunner")) return "rail";
    return null;
  }

  function normalizeRouteMode(routeType) {
    if (!routeType) return null;
    const railLines = ["blue line", "red line", "green line", "s line", "frontrunner"];
    const t = routeType.toLowerCase();
    if (railLines.some(r => t.includes(r))) return "rail";
    return "bus";
  }

  /* =========================
     Core layers
  ========================= */
  const layers = {
    od: L.layerGroup().addTo(map),
    tripRoute: L.layerGroup().addTo(map),
    accessEgress: L.layerGroup().addTo(map),
    tdi: L.geoJSON(null).addTo(map)
  };

  /* =========================
     Draw sample trips
  ========================= */
  function drawSampleTrips(samples) {
    layers.tripRoute.clearLayers();

    let bounds = null;

    samples.forEach(s => {
      if (!s.route || s.route.length < 2) return;

      const color =
        s.mode === "rail"
          ? "#7c3aed"
          : s.mode === "bus"
          ? "#2563eb"
          : s.mode === "walk_bike"
          ? "#16a34a"
          : "#6b7280";

      const line = L.polyline(s.route, {
        color,
        weight: 5,
        opacity: 0.9
      })
        .addTo(layers.tripRoute)
        .bringToFront();

      // 累积 bounds
      if (!bounds) bounds = line.getBounds();
      else bounds.extend(line.getBounds());
    });

    // ✅ 只在这里处理 bounds
    if (bounds) {
      currentViewBounds = bounds;          // 🔑 保存当前数据视角
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  function recenterMap() {
    if (currentViewBounds) {
      map.fitBounds(currentViewBounds, { padding: [40, 40] });
    } else {
      map.setView([40.758, -111.89], 12);
    }
  }
  const RecenterControl = L.Control.extend({
    options: { position: "topright" },

    onAdd: function () {
      const btn = L.DomUtil.create("button", "recenter-btn");
      btn.innerHTML = "⌖";
      btn.title = "Recenter map";

      btn.onclick = e => {
        e.stopPropagation();
        recenterMap();
      };

      return btn;
    }
  });

  map.addControl(new RecenterControl());


  /* =========================
     Facility layers
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

  /* =========================
     Load sample JSON
  ========================= */
  async function loadSampleTrips() {
    const res = await fetch("data/samples/samples.json");
    if (!res.ok) throw new Error("Failed to load samples.json");
    const json = await res.json();
    return json.samples;
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
     Init
  ========================= */
  async function init() {
    try {
      await loadStops();
    } catch (e) {
      console.error("loadStops failed", e);
    }

    try {
      await loadRoutes();
    } catch (e) {
      console.error("loadRoutes failed", e);
    }

    Object.values(facilityLayers).forEach(l => map.addLayer(l));

    document.querySelectorAll(".bm-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        switchBasemap(btn.dataset.basemap);
      });
    });

    // ===== Load samples =====
    try {
      const samples = await loadSampleTrips();
      drawSampleTrips(samples);
    } catch (e) {
      console.error("loadSampleTrips failed", e);
    }
  }

  init();

})();
