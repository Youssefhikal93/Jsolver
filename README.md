# Jsolver Board

A drag-and-drop whiteboard for practising data structures and algorithms: linked lists, stacks, queues, trees, hash tables, graphs and sorting.

## Features

- Add nodes, arrays, pointers (`head`, `curr`, `i`, …), key/value boxes, sets, `null` and notes
- Link nodes with `next`, `prev` or undirected edges
- Undo/redo, snap to grid, light/dark theme
- The board is saved in your browser automatically
- Press `?` in the app to see keyboard shortcuts

## Running locally

It's a static site with no build step. Open `index.html` in a browser, or serve the folder:

```sh
npx serve .
```

## Project structure

```
index.html      page markup and toolbar
css/styles.css  styles
js/             classic scripts sharing one global scope, loaded in order by index.html
  core.js         constants, state, geometry helpers
  model.js        node/link operations
  render.js       SVG rendering
  interaction.js  pointer and keyboard handling
  topics.js       course topics with buttons that build example structures
  app.js          toolbar wiring and startup
```

## Deployment

Every push to `main` deploys the site to Netlify via [.github/workflows/deploy.yml](.github/workflows/deploy.yml), and pull requests get preview deploys. The workflow needs two repository secrets: `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
