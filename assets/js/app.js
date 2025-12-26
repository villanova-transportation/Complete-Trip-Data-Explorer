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
  let samplesVisible = true;

  /* =========================
     Draw sample trips
  ========================= */
  function drawSampleTrips(samples) {
    layers.tripRoute.clearLayers();

    let bounds = null;

    samples.forEach(s => {
      if (!s.route || s.route.length < 2) return;
      // ================
      // 1. 画路线
      // ================
      const color =
        s.mode === "rail"
          ? "#e23c1bff"
          : s.mode === "bus"
          ? "rgba(235, 129, 37, 1)"
          : s.mode === "car"
          ? "#391b57ff"
          : s.mode === "walk_bike"
          ? "#15c856ff"
          : "#6b7280";

      const line = L.polyline(s.route, {
        color,
        weight: 3,
        opacity: 0.9
      })
        .addTo(layers.tripRoute)
        .bringToFront();
      // ================
      // 2. 起点
      // ================
      if (s.origin?.lat && s.origin?.lon) {
        L.circleMarker([s.origin.lat, s.origin.lon], {
          radius: 6,
          color: "#ef4444",       // red
          fillColor: "#ef4444",
          fillOpacity: 1
        })
        .bindPopup("Origin")
        .addTo(layers.tripRoute);
      }

      // ================
      // 3. 终点
      // ================
      if (s.destination?.lat && s.destination?.lon) {
        L.circleMarker([s.destination.lat, s.destination.lon], {
          radius: 6,
          color: "#22c55e",       // green
          fillColor: "#22c55e",
          fillOpacity: 1
        })
        .bindPopup("Destination")
        .addTo(layers.tripRoute);
      }

      // ================
      // 4. access 换乘站
      // ================
      if (s.access?.stop_id && s.access?.stop_name) {
        const stop = layers.tripRoute; // layer
          
        // 如果 CSV 里没有 lat/lon，需要你提前给 access 加上坐标
        if (s.access.lat && s.access.lon) {
          L.circleMarker([s.access.lat, s.access.lon], {
            radius: 5,
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.9
          })
          .bindPopup(`Access Stop<br>${s.access.stop_name}`)
          .addTo(layers.tripRoute);
        }
      }

      // ================
      // 5. egress 换乘站
      // ================
      if (s.egress?.stop_id && s.egress?.stop_name) {
        if (s.egress.lat && s.egress.lon) {
          L.circleMarker([s.egress.lat, s.egress.lon], {
            radius: 5,
            color: "#a855f7",
            fillColor: "#a855f7",
            fillOpacity: 0.9
          })
          .bindPopup(`Egress Stop<br>${s.egress.stop_name}`)
          .addTo(layers.tripRoute);
        }
      }

      // ================
      // 6. 累积 bounds
      // ================
      if (!bounds) bounds = line.getBounds();
      else bounds.extend(line.getBounds());
    });

    // ✅ 只在这里处理 bounds
    if (bounds) {
      currentViewBounds = bounds;          // 🔑 保存当前数据视角
      map.fitBounds(bounds, { padding: [40, 40] });
    }
    }
  function toggleSamples() {
    samplesVisible = !samplesVisible;

    if (samplesVisible) {
      layers.tripRoute.addTo(map);
    } else {
      layers.tripRoute.removeFrom(map);
    }
  }
  function drawODFlows(odData, options = {}) {
    const {
      month = null,
      useLinked = true
    } = options;

    layers.od.clearLayers();

    const maxCount = Math.max(
      ...odData.map(d => useLinked ? d.linked_count : d.unlinked_count)
    );

    odData.forEach(d => {
      if (month && d.month !== month) return;

      const count = useLinked ? d.linked_count : d.unlinked_count;
      if (!count || count <= 0) return;

      const oLat = d.o_lat;
      const oLon = d.o_lon;
      const dLat = d.d_lat;
      const dLon = d.d_lon;

      // ===== 曲率（按距离自适应）=====
      const dx = dLon - oLon;
      const dy = dLat - oLat;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curvature = dist * 0.3;

      const midLat = (oLat + dLat) / 2 + curvature;
      const midLon = (oLon + dLon) / 2;

      // ===== 线宽 scaling =====
      const weight = 1 + 6 * (count / maxCount);

      const path = L.curve(
        [
          "M", [oLat, oLon],
          "Q", [midLat, midLon],
              [dLat, dLon]
        ],
        {
          color: "rgba(59,130,246,0.7)",   // blue
          weight: weight,
          opacity: 0.8,
          interactive: true
        }
      );

      path.bindPopup(
        `
        <b>OD Flow</b><br>
        Mode: ${d.travel_mode}<br>
        ${useLinked ? "Linked" : "Unlinked"} count: ${count}
        `
      );

      path.addTo(layers.od);
    });
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
    bus_stop: L.layerGroup(),
    rail_stop: L.layerGroup(),
    bus_route: L.layerGroup(),
    rail_route: L.layerGroup()
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
  async function loadODFlows() {
    const res = await fetch("data/od/od_dashboard_topk.json");
    if (!res.ok) throw new Error("Failed to load OD JSON");
    return await res.json();
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
    document.querySelector('[data-view="samples"]').addEventListener("click", () => {
      toggleSamples();
    });
    document.querySelector('[data-view="od"]').addEventListener("click", () => {
      toggleOD();
    });

    let odVisible = false;
    let cachedOD = null;

    async function toggleOD() {
      odVisible = !odVisible;

      if (!odVisible) {
        layers.od.clearLayers();
        return;
      }

      if (!cachedOD) {
        cachedOD = await loadODFlows();   // 你之前已经写好的
      }

      drawODFlows(cachedOD, {
        month: "2020-01",     // 之后可接 slider
        useLinked: true
      });
    }
    document
      .querySelector('[data-view="od"]')
      .addEventListener("click", toggleOD);

  }

  init();

})();
