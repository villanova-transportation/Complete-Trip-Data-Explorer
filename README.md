# Complete Trip Explorer

An interactive, web-based explorer for Complete Trip data.

This dashboard enables users to explore real-world travel behavior through
origin–destination (OD) flows, linked trips, and multimodal route trajectories,
going beyond traditional static OD matrices.

---

## What Is Complete Trip Data?

Complete Trip data reconstructs **door-to-door daily travel** from anonymized
location-based service (LBS) data. Each trip represents a full journey between
activity locations and may consist of multiple linked segments and travel modes.

Compared with conventional mobility datasets, Complete Trip data provides:

- True origin–destination pairs at the trip level  
- Linked trips capturing transfers and trip chains  
- Multimodal travel sequences (walk, bus, rail, auto)  
- Route-level trajectories mapped to real transportation networks  

This structure enables behavioral analysis that cannot be achieved using
aggregated OD tables or single-mode trip records.

---

## What Does This Explorer Do?

The Complete Trip Explorer is designed as an **interactive demonstration tool**
for agencies and researchers. It allows users to:

- Visualize OD flows between selected zones  
- Select any OD pair and inspect representative trips  
- Examine linked trips and multimodal travel chains  
- View route-level trajectories on the transportation network  

The goal is to make complete-trip concepts **intuitive, explorable, and concrete**
for planning, evaluation, and outreach purposes.

---

## Intended Users

This tool is intended for:

- Transportation agencies (DOTs, MPOs, transit agencies)  
- Urban and transportation planners  
- Mobility and travel behavior researchers  

It is optimized for demonstration, exploration, and communication rather than
for large-scale batch analysis.

---

## Live Demo

▶ **Interactive Demo**  
https://villanova-transportation.github.io/Complete-Trip-Data-Explorer/

*(The demo uses a sampled and anonymized subset of data for visualization purposes.)*

---

## Data and Privacy Notes

- All data used in this demo are anonymized and spatially aggregated  
- Only sampled trips are included for performance and privacy protection  
- Exact timestamps and sensitive identifiers are removed or masked  

This repository **does not distribute the full Complete Trip dataset**.
Data access is subject to separate agreements and approvals.

---

## Repository Structure
complete-trip-explorer/
│
├── index.html          # Landing page
├── explorer.html       # Interactive dashboard
│
├── assets/
│   ├── css/            # Stylesheets
│   ├── js/             # Visualization and interaction logic
│   └── img/            # Logos and static images
│
├── data/               # Sampled and aggregated demo data
│
├── README.md
└── LICENSE

---

## Development Philosophy

This project is intentionally implemented as a **static, client-side web
application** to ensure:

- Easy deployment via GitHub Pages  
- No backend dependencies  
- Transparency and reproducibility  
- Low barrier for reuse and adaptation  

The focus is on clarity, robustness, and interpretability rather than
UI complexity.

---

## Attribution

Developed by **Ruohan Li**  
NovaMobility Lab, Villanova University

If you use or adapt this explorer for presentations or demonstrations,
please cite or acknowledge the original project.

---

## License

This project is released under the MIT License.
