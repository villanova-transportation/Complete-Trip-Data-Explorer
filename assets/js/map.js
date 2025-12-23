const map = L.map("map").setView([40.76, -111.89], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

let currentLayer = null;

// Populate selector
const selector = document.getElementById("tripSelector");
demoTrips.forEach((trip, idx) => {
  const opt = document.createElement("option");
  opt.value = idx;
  opt.textContent = trip.id;
  selector.appendChild(opt);
});

selector.addEventListener("change", () => {
  const trip = demoTrips[selector.value];

  if (currentLayer) {
    map.removeLayer(currentLayer);
  }

  currentLayer = L.polyline(trip.route, {
    color: "red",
    weight: 4
  }).addTo(map);

  map.fitBounds(currentLayer.getBounds());

  document.getElementById("tripInfo").innerHTML = `
    <strong>${trip.id}</strong><br/>
    Mode: ${trip.mode}<br/>
    Duration: ${trip.duration}
  `;
});