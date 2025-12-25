// js/dataLoader.js
async function loadSampleData() {
  const res = await fetch("data/samples/samples.json");
  if (!res.ok) {
    throw new Error("Failed to load samples.json");
  }
  return await res.json();
}

// ✅ 挂到全局
window.loadSampleData = loadSampleData;
