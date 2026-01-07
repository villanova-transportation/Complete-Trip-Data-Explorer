/* global L */
let currentViewBounds = null;
(function () {

  /* =========================
     Map init
  ========================= */
  const map = L.map("map", { zoomControl: true })
    .setView([40.758, -111.89], 12);

  // L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  //   attribution: "© OpenStreetMap contributors"
  // }).addTo(map);

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
    odPolygon: L.layerGroup().addTo(map),  // 🆕
    odFlow: L.layerGroup().addTo(map),     // 🆕
    tripRoute: L.layerGroup().addTo(map),
    accessEgress: L.layerGroup().addTo(map),
    tdi: L.geoJSON(null).addTo(map)
  };

  /* =========================
     Draw OD
  ========================= */
  function drawODPolygon(od) {
    layers.odPolygon.clearLayers();

    if (!od?.origin?.geometry || !od?.destination?.geometry) return;

    const originStyle = {
      color: "#22c55e",        // blue
      weight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.15
    };

    const destStyle = {
      color: "#ef4444",        // red
      weight: 2,
      fillColor: "#ef4444",
      fillOpacity: 0.15
    };

    L.geoJSON(od.origin.geometry, {
      style: originStyle
    })
      .bindPopup("Origin Tract")
      .addTo(layers.odPolygon);

    L.geoJSON(od.destination.geometry, {
      style: destStyle
    })
      .bindPopup("Destination Tract")
      .addTo(layers.odPolygon);
  }

  /* =========================
     Draw sample trips
  ========================= */
  let activeLinkedTripId = null;
  const linkedTripLayers = new Map();   // linked_trip_id → LayerGroup

  function drawSampleTrips(linkedTrips) {
    layers.tripRoute.clearLayers();
    linkedTripLayers.clear();

    let bounds = null;

    linkedTrips.forEach(lt => {
      const group = L.layerGroup().addTo(layers.tripRoute);
      linkedTripLayers.set(lt.linked_trip_id, group);

      // 1) origin marker
      if (lt.origin && Number.isFinite(Number(lt.origin.lat)) && Number.isFinite(Number(lt.origin.lon))) {
        L.circleMarker([Number(lt.origin.lat), Number(lt.origin.lon)], {
          radius: 7,
          color: "#22c55e",
          fillColor: "#22c55e",
          fillOpacity: 1
        }).bindPopup("Origin").addTo(group);
      }

      // 2) destination marker
      if (lt.destination && Number.isFinite(Number(lt.destination.lat)) && Number.isFinite(Number(lt.destination.lon))) {
        L.circleMarker([Number(lt.destination.lat), Number(lt.destination.lon)], {
          radius: 7,
          color: "#ef4444",
          fillColor: "#ef4444",
          fillOpacity: 1
        }).bindPopup("Destination").addTo(group);
      }

      // 3) legs
      (lt.legs || []).forEach((leg) => {
        if (!leg.route || leg.route.length < 2) return;

        const color =
          leg.mode === "rail" ? "#e23c1bff"
          : leg.mode === "bus" ? "rgba(37,166,235,1)"
          : leg.mode === "car" ? "#391b57ff"
          : leg.mode === "walk_bike" ? "#15c856ff"
          : "#6b7280";

        const line = L.polyline(leg.route, {
          color,
          weight: 3,
          opacity: 0.85
        }).addTo(group).bringToFront();

        line.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          highlightLinkedTrip(lt.linked_trip_id);
        });

        if (!bounds) bounds = line.getBounds();
        else bounds.extend(line.getBounds());
      });

      // 4) transfers  ✅（蓝色虚线边框）
      (lt.transfers || []).forEach((t, i) => {
        const lat = Number(t.lat) + 0.00015;
        const lon = Number(t.lon) + 0.00015;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const transferMarker = L.circleMarker([lat, lon], {
          radius: 7,
          color: "#2563eb",
          weight: 2,
          dashArray: "4,3",
          fillColor: "#bfdbfe",
          fillOpacity: 0.9
        }).bindPopup(`Transfer ${i + 1}`).addTo(group);

        transferMarker.isTransfer = true;
        transferMarker.bringToFront();
      });
    });

    // ✅ 一定要放在 forEach 外面
    if (bounds) {
      currentViewBounds = bounds;
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }


  function highlightLinkedTrip(targetId) {
    activeLinkedTripId = targetId;

    linkedTripLayers.forEach((group, id) => {
      group.eachLayer(layer => {
        if (id === targetId) {
          // 高亮
          if (layer.setStyle) {
            layer.setStyle({ opacity: 1, weight: 4 });
          }
          if (layer.setRadius) {
            layer.setRadius(8);
          }
        } else {
          // 灰化
          if (layer.setStyle) {
            layer.setStyle({ opacity: 0.15, weight: 2 });
          }
          if (layer.setRadius) {
            if (layer.isTransfer) {
              layer.setRadius(id === targetId ? 9 : 6);
            } else {
              layer.setRadius(id === targetId ? 8 : 4);
            }
          }
        }
      });
    });
  }
  map.on("click", () => {
    activeLinkedTripId = null;
    linkedTripLayers.forEach(group => {
      group.eachLayer(layer => {
        if (layer.setStyle) {
          layer.setStyle({ opacity: 0.85, weight: 3 });
        }
        if (layer.setRadius) {
          if (layer.isTransfer) {
            layer.setRadius(7);
          } else {
            layer.setRadius(6);
          }
        }
      });
    });
  });


  function drawODFlows(odData, options = {}) {
    const {
      month = null,
      useLinked = true
    } = options;

    layers.odFlow.clearLayers();

    const maxCount = Math.max(
      1,
      ...odData.map(d => useLinked ? d.linked_count : d.unlinked_count)
    );

    odData.forEach(d => {
      if (month && d.month !== month) return;

      // ① 坐标存在性 + 数值合法性
      const oLat = Number(d.o_lat);
      const oLon = Number(d.o_lon);
      const dLat = Number(d.d_lat);
      const dLon = Number(d.d_lon);

      if (
        !Number.isFinite(oLat) ||
        !Number.isFinite(oLon) ||
        !Number.isFinite(dLat) ||
        !Number.isFinite(dLon)
      ) {
        console.warn("❌ Skip OD (invalid coords):", d);
        return;
      }

      // ② 计数检查
      const count = useLinked ? d.linked_count : d.unlinked_count;
      if (!Number.isFinite(count) || count <= 0) return;

      // ③ 防御：禁止零长度 OD
      if (oLat === dLat && oLon === dLon) {
        console.warn("❌ Skip OD (zero-length):", d);
        return;
      }

      // ===== 曲率（用于“伪曲线”）=====
      const dx = dLon - oLon;
      const dy = dLat - oLat;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curvature = dist * 0.3;

      const midLat = (oLat + dLat) / 2 + curvature;
      const midLon = (oLon + dLon) / 2;

      // ===== 线宽 scaling =====
      const weight = 1 + 6 * (count / maxCount);

      // ✅ 用 polyline（三点）代替 curve
      const path = L.polyline(
        [
          [oLat, oLon],
          [midLat, midLon],
          [dLat, dLon]
        ],
        {
          color: "rgba(59,130,246,0.7)",
          weight: weight,
          opacity: 0.8,
          smoothFactor: 1.5,   // 视觉更平滑
          interactive: true
        }
      );

      path.bindPopup(`
        <b>OD Flow</b><br>
        Mode: ${d.travel_mode}<br>
        ${useLinked ? "Linked" : "Unlinked"} count: ${count}
      `);

      path.addTo(layers.odFlow);
    });

  }

  function recenterMap() {
    if (currentViewBounds) {
      map.fitBounds(currentViewBounds, { padding: [40, 40] });
    } else {
      map.setView([40.758, -111.89], 12);
    }
  }
  // const RecenterControl = L.Control.extend({
  //   options: { position: "topright" },

  //   onAdd: function () {
  //     const btn = L.DomUtil.create("button", "recenter-btn");
  //     btn.innerHTML = "⌖";
  //     btn.title = "Recenter map";

  //     btn.onclick = e => {
  //       e.stopPropagation();
  //       recenterMap();
  //     };

  //     return btn;
  //   }
  // });

  // map.addControl(new RecenterControl());


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
  async function loadSamplesByOD(originTract, destinationTract) {
    const filename = `${originTract}_to_${destinationTract}.json`;
    const url = `data/samples/${filename}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sample file not found: ${url}`);

    return await res.json();
  }
  async function applyODSelection() {
    const o = document.getElementById("originTract").value;
    const d = document.getElementById("destinationTract").value;

    // 1️⃣ 未选全，不提示（安静）
    if (!o || !d) {
      setMapStatus("Select an origin and destination census tract");
      return;
    }

    // 2️⃣ O = D（这是逻辑错误，不是异常）
    if (o === d) {
      setMapStatus("Origin and destination cannot be the same", "warn");
      return;
    }

    try {
      const sampleJson = await loadSamplesByOD(o, d);
      const stats = await loadStatsForOD(o, d);
      
      layers.odPolygon.clearLayers();
      layers.tripRoute.clearLayers();

      drawODPolygon(sampleJson.od);
      drawSampleTrips(sampleJson.linked_trips);
      renderStats(stats);

      setMapStatus(`Loaded OD: ${o} → ${d}`, "info");

    } catch (e) {
      console.warn(e);
      setMapStatus(`No sample data for OD: ${o} → ${d}`, "error");
    }
  }

  // ===== Sync mobile OD selectors to desktop logic =====
  function syncODSelectors(origin, destination) {
    const o = document.getElementById("originTract");
    const d = document.getElementById("destinationTract");

    if (!o || !d) return;

    o.value = origin;
    d.value = destination;

    applyODSelection();
  }
    
  async function loadStatsForOD(origin, destination) {
    const filename = `${origin}_to_${destination}.stats.json`;
    const url = `data/samples/${filename}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Stats file not found:", url);
      return null;
    }
    return await res.json();
  }
  function renderTravelTimeHistogram(hist, durStats) {
    const canvas = document.getElementById("travelTimeChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // ===== DPI FIX =====
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    // Set actual pixel size
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // Keep CSS size unchanged
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Logical drawing size (CSS pixels)
    const w = cssWidth;
    const h = cssHeight;


    ctx.clearRect(0, 0, w, h);

    if (!hist || !hist.counts || hist.counts.length === 0) {
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#444";
      ctx.fillText("No distribution available.", 6, 18);
      return;
    }

    const counts = hist.counts;
    const edges = hist.bin_edges_min;

    const maxCount = Math.max(...counts, 1);
    const padTop = 32;
    const padBottom = 16;
    const chartH = h - padTop - padBottom;

    const barW = w / counts.length;

    const LABEL_TOP_Y = 14;          // label 起始 y
    const LABEL_LINE_GAP = 12;       // 多个 label 的垂直间距
    const LABEL_SAFE_LEFT = 4;
    const LABEL_SAFE_RIGHT = w - 4;

    // Title
    ctx.save();
    ctx.fillStyle = "#111";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Travel Time Distribution", w / 2, padTop - 16);
    ctx.restore();
    // y-label
    ctx.save();
    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Trips", 2, padTop + 10);
    ctx.restore();

    // Bars
    ctx.fillStyle = "rgba(59,130,246,0.75)";
    counts.forEach((c, i) => {
      const barH = (c / maxCount) * chartH;
      const x = i * barW + 1;
      const y = padTop + (chartH - barH);
      ctx.fillRect(x, y, Math.max(1, barW - 2), barH);
    });

    // X axis
    ctx.save();
    ctx.strokeStyle = "#999";
    ctx.beginPath();
    ctx.moveTo(0, padTop + chartH);
    ctx.lineTo(w, padTop + chartH);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Travel Time (minutes)", w / 2, h - 2);
    ctx.restore();
    // helper: minutes -> x pixel
    function timeToX(t) {
      const minT = edges[0];
      const maxT = edges[edges.length - 1];
      const clamped = Math.max(minT, Math.min(maxT, t));
      return ((clamped - minT) / (maxT - minT)) * w;
    }

    function drawVerticalLineSafe(x, label, color, row = 0) {
      ctx.save();

      // ===== 垂直线 =====
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;    
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      // ===== label =====
      ctx.font = "10px sans-serif";
      ctx.fillStyle = color;

      const textW = ctx.measureText(label).width;
      let textX = x + 4;

      // 👉 防止出右边界
      if (textX + textW > LABEL_SAFE_RIGHT) {
        textX = x - textW - 4;
      }

      // 👉 防止出左边界
      if (textX < LABEL_SAFE_LEFT) {
        textX = LABEL_SAFE_LEFT;
      }

      const textY = LABEL_TOP_Y + row * LABEL_LINE_GAP;
      ctx.fillText(label, textX, textY);

      ctx.restore();
    }
    function drawVerticalLineOnly(x, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;          // 👈 关键：调粗
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }


    const xMedian = Number.isFinite(durStats.median)
      ? timeToX(durStats.median)
      : null;

    const xMean = Number.isFinite(durStats.mean)
      ? timeToX(durStats.mean)
      : null;

    ctx.font = "10px sans-serif";

    const medianLabel = `Median ${durStats.median.toFixed(1)}`;
    const meanLabel   = `Mean ${durStats.mean.toFixed(1)}`;


    if (Number.isFinite(xMedian)) {
      drawVerticalLineOnly(
        xMedian,
        "#eb253cff"
      );
    }

    if (Number.isFinite(xMean)) {
      drawVerticalLineSafe(
        xMean,
        `Mean ${durStats.mean.toFixed(1)}`,
        "#f59e0b",
        1
      );
    }

  }


  function renderStats(stats) {
    if (!stats) {
      document.getElementById("statsTrips").textContent =
        "No statistics available for this OD.";

      const canvas = document.getElementById("travelTimeChart");
      if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

      return;
    }

    // 1️⃣ Trip count
    document.getElementById("statsTrips").textContent =
      `Complete trips: ${stats.counts.linked_trips}`;

    // 2️⃣ Duration
    const d = stats.trip_duration_min;
    document.getElementById("statsDuration").textContent =
      `Travel time (min): median ${d.median.toFixed(1)} `
      + `(IQR ${d.p25.toFixed(1)}–${d.p75.toFixed(1)})`;

    // 3️⃣ Transfers
    const t = stats.segments;
    document.getElementById("statsSegments").textContent =
      `Segments: avg ${t.avg}, max ${t.max}`;

    // 4️⃣ Mode involvement
    const m = stats.mode_involvement;
    document.getElementById("statsModes").textContent =
      `Mode involvement: `
      + `Car ${(m.car * 100).toFixed(0)}%, `
      + `Rail ${(m.rail * 100).toFixed(0)}%, `
      + `Bus ${(m.bus * 100).toFixed(0)}%`;
    renderTravelTimeHistogram(
      stats.travel_time_distribution,
      stats.trip_duration_min
    );

  }

  function setMapStatus(message, type = "info") {
    const el = document.getElementById("mapStatus");
    if (!el) return;

    el.innerText = message;

    el.style.borderColor =
      type === "error" ? "#ef4444" :
      type === "warn" ? "#f59e0b" :
      "#d0d7e6";

    el.style.color =
      type === "error" ? "#b91c1c" :
      type === "warn" ? "#92400e" :
      "#222";
  }

  async function loadODFlows() {
    const res = await fetch("data/OD/od_dashboard_topk.json");
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
    
  document.getElementById("originTract").addEventListener("change", applyODSelection);
  document.getElementById("destinationTract").addEventListener("change", applyODSelection);

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

    applyODSelection(); // 用当前下拉框默认值加载
    
    // ===== Mobile OD selectors =====
    const oMobile = document.getElementById("originTractMobile");
    const dMobile = document.getElementById("destinationTractMobile");

    if (oMobile && dMobile) {
      // 把 desktop 的 options 复制给 mobile
      oMobile.innerHTML = document.getElementById("originTract").innerHTML;
      dMobile.innerHTML = document.getElementById("destinationTract").innerHTML;

      // 默认同步当前值
      oMobile.value = document.getElementById("originTract").value;
      dMobile.value = document.getElementById("destinationTract").value;

      oMobile.addEventListener("change", () => {
        syncODSelectors(oMobile.value, dMobile.value);
      });

      dMobile.addEventListener("change", () => {
        syncODSelectors(oMobile.value, dMobile.value);
      });
    }

    const menuBtn = document.getElementById("menuToggle");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("open");
      });
    }

    // document.querySelector('[data-view="samples"]').addEventListener("click", () => {
    //   toggleSamples();
    // });

    let odVisible = false;
    let cachedOD = null;

    async function toggleOD() {
      odVisible = !odVisible;

      if (!odVisible) {
        layers.odFlow.clearLayers();
        return;
      }

      if (!cachedOD) {
        cachedOD = await loadODFlows();   // 你之前已经写好的
      }

      drawODFlows(cachedOD, {
        month: null,   // 👈 不过滤
        useLinked: true
      });
    }
    document
      // .querySelector('[data-view="od"]')
      // .addEventListener("click", toggleOD);

  }

  init();

})();
