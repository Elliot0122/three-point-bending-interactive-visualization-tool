# Three Point Bending Data Visualization

An interactive static web app for visualizing and analyzing three-point bending test data. Upload a text file, explore the data with configurable axes, and measure mechanical properties.

## Features

- **File upload** – Load text files with comma- or tab-separated data
- **Interactive plot** – Scatter visualization with:
  - Maximum strength (red point)
  - Stiffness line (purple)
  - Custom slope points (blue, draggable)
  - Yield point (green, draggable)
- **Axis selection** – Choose X and Y from Elapsed Time, Scan Time, Display 1, Load 1, Load 2
- **Reset points** – Restore slope and yield points to defaults
- **Export to CSV** – Download mechanical properties (slope, area, yield displacement, yield strength, max strength)

## Data format

Supports two formats (identical to the Python app):

| Format | Example | Separator | Notes |
|--------|---------|-----------|-------|
| Tab | 1.txt, 4.txt | `\t` | May have extra columns per row |
| CSV | 62.TXT | `,` | May have space-padding, optional quotes |

Both formats: skip lines starting with `Axial Counts`, skip first 5 lines, then read columns `Elapsed Time`, `Scan Time`, `Display 1`, `Load 1`, `Load 2` (indices 1–5). Sample files: `Three-Point-Bending-Data-Visualization/public/1.txt`, `62.TXT`, `4.txt`.

## Local development

Serve the files with any static server:

```bash
# Python
python -m http.server 8000

# Node (npx)
npx serve .

# Then open http://localhost:8000
```

## GitHub Pages deployment

1. Push the repo to GitHub.
2. Settings → Pages → Source: Deploy from branch.
3. Branch: `main` (or `master`), folder: `/ (root)`.
4. Save. The site will be available at `https://<username>.github.io/<repo>/`.
