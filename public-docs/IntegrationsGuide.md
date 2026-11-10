# Boomi EmbedKit — Integrations Guide (1.7)

> How the integrations list, the Add Integration catalog and the setup wizard work in EmbedKit 1.7, how to limit which environments a session can use, and every flag that turns these features on or off. It also covers the opt-in Cross Reference Tables screen. For the full option and token reference, see [ConfigurationReference.md](./ConfigurationReference.md). For what changed in this release, see [ReleaseNotes.md](./ReleaseNotes.md).

---

## Contents

1. [What's new at a glance](#1-whats-new-at-a-glance)
2. [UI versions: adopting new UI per component](#2-ui-versions-adopting-new-ui-per-component)
3. [The integrations list](#3-the-integrations-list)
4. [The Add Integration catalog](#4-the-add-integration-catalog)
5. [After install: the setup wizard](#5-after-install-the-setup-wizard)
6. [Limiting environments](#6-limiting-environments)
7. [Flags reference](#7-flags-reference)
8. [Customizing the look](#8-customizing-the-look)
9. [Server API for list sorting and filtering](#9-server-api-for-list-sorting-and-filtering)
10. [Cross Reference Tables](#10-cross-reference-tables)
11. [Upgrade checklist](#11-upgrade-checklist)

---

## 1. What's new at a glance

| Feature | Where | On by default |
|---------|-------|---------------|
| Searchable Add Integration catalog with connector icons | Add Integration modal | at `uiVersion` 1.7.0 |
| New card layout: no type row, menu at the top, full-width environment row, smaller title, fixed card width | Integrations list | at `uiVersion` 1.7.0 |
| Clickable cards: clicking a card opens Edit (Edit is also the first menu item) | Integrations list | at `uiVersion` 1.7.0 |
| Clickable catalog cards, or an **Install** button on each card | Add Integration modal | Install button always (configurable) |
| Filter by environment and connector | Integrations list and catalog | at `uiVersion` 1.7.0 |
| Environment column and sortable Name / Description / Environment headers | Integrations table view | at `uiVersion` 1.7.0 |
| **Sort by** menu: Name, Description, Environment, Created, Last viewed | Integrations list (card and table views) | at `uiVersion` 1.7.0 |
| Going back to the list keeps the page, the filters and the sort | Integrations list | the page always; the filters at `uiVersion` 1.7.0; the sort wherever a sort control shows |
| **Unattached** pill for integrations attached to no environment | Integrations list | wherever the environment is shown |
| Setup wizard skips steps with nothing to configure | After install and on Edit | always |
| Single-install packs use the setup wizard and can edit connections | After install and on Edit | always |
| Session environment scope (`environments` at login) | Login body | opt-in |
| Cross Reference Tables: view and edit an integration's cross reference tables (menu item, setup wizard step, Map Fields link). New in NEXT_VERSION | Integrations list menu, setup wizard, Map Fields | opt-in (`crossReferenceTables.enabled`), whatever the `uiVersion` |

Anything marked "at `uiVersion` 1.7.0" stays off for a component until you set its `uiVersion` to `'1.7.0'` or later (see the next section). The rest are bug fixes or behavior that applies to every component, or opt-in options that are off until you turn them on.

---

## 2. UI versions: adopting new UI per component

Upgrading the EmbedKit package never changes how an existing component looks. Each component renders the UI of the release named in its `uiVersion`. A component without one keeps the **1.6.1** UI.

```js
// boomi.config.js
export default {
  components: {
    integrationsPage: { renderType: 'integration', uiVersion: '1.7.0' }, // new UI
    agentsPage:       { renderType: 'agent' },                            // unchanged: 1.6.1 UI
  },
};
```

- **Per component.** Each `componentKey` opts in on its own, so you can roll the new UI out one page at a time.
- **Explicit options win.** `uiVersion` only sets defaults. Any option you set yourself overrides it: `showConnectors: true` on a 1.6.1 component adds just the icons, and `form.addIntegration.layout: 'form'` on a 1.7.0 component keeps the old dropdown form.
- **Formats.** `'1.7'`, `'1.7.0'` and `'v1.7.0'` all work. Anything else logs a console warning and falls back to 1.6.1.
- **What is not gated.** Bug fixes and options that are off unless you turn them on apply to every component regardless of `uiVersion`.

---

## 3. The integrations list

### Which integrations appear

The list shows the installed integrations (integration pack instances) of the packs linked to the session's **account group**. Instances of packs that are not linked to that account group are never shown, even if they exist in the child account. `renderType` then splits them: `'integration'` hides agent packs and `'agent'` shows only agents. Packs with `agents[packId].allowInstall: false` are left out. When an environment scope is set (see [section 6](#6-limiting-environments)), only instances attached to an in-scope environment appear.

The list is paged on the server, 12 per page by default. Set `integrations.pagination.pageSize` (1 to 30) to change it. The same `integrations.pagination` block sets where the page controls sit and how they look; see [Pagination](./ConfigurationReference.md#pagination-integrationspagination).

### Cards (1.7 UI)

| Part | 1.7 UI | 1.6.1 UI |
|------|--------|----------|
| Type row ("Integration" / "Single Install Integration") | Off (`integrations.integration.showType`) | On |
| Actions (⋮) menu | Right end of the top visible row: the type row if shown, otherwise the title row | Bottom right |
| Title | 1rem | 1.25rem |
| Connector icons | On (`showConnectors`) | Off |
| Environment | Full-width row above the button (`showEnvironment`) | Off; inline chip if turned on |
| Edit button | Off (`editButton.show`); the whole card opens Edit, and **Edit** is the first item in the ⋮ menu | On |
| Card width | Fixed, `--boomi-integration-card-width` (16rem), as many per row as fit | 1–4 stretched columns |

Agent cards always keep their **Run Agent** button. `showEdit: false` turns editing off completely: no button, no Edit menu item, and the card is not clickable.

A clickable card works with the mouse and with Enter or Space when it has keyboard focus. Clicks inside the ⋮ menu, and the click that ends a text selection, don't open Edit.

### Unattached integrations

An integration pack instance and its link to an environment are separate records in Boomi. If the link is removed (detached in the platform or through the API), or the attach step failed during an install, the instance remains but belongs to no environment. EmbedKit shows these with an orange **Unattached** pill where the environment would be, on the card and in the table. Hovering it explains that it needs attaching in the platform. Change the text with `integrations.integration.unattachedLabel`.

The pill needs a server that reports each instance's environments (embedkit-server 1.7). With an older server nothing is shown, so you won't get false warnings.

### Table view

At 1.7 the table gains an **Environment** column (it follows `showEnvironment`) and sortable **Name**, **Description** and **Environment** headers (`integrations.table.sortable`). Click a header once for ascending, again for descending, and a third time for the default order. Sorting runs on the server across the whole list, not just the visible page, and returns to page 1.

### Sort by

A **Sort by** menu sits left of the grid and table toggle, so the card view can be sorted too (`integrations.sort.show`, which follows `integrations.table.sortable`). It offers **Default order**, which is selected until the user picks another and is the order the list always had, plus Name, Description, Environment, **Created** and **Last viewed**.

- Picking an option starts it in its natural direction: A to Z for text, newest first for Created, most recent first for Last viewed. Picking the same option again reverses it.
- The menu and the table headers set the same sort, so they always agree. Created and Last viewed have no column, so choosing them leaves every header inactive.
- **Created** is the date Boomi recorded when the integration was installed. Integrations installed before Boomi recorded a date count as the oldest and keep Boomi's own order.
- **Last viewed** is the last time the user opened an integration to configure or run it. Integrations never opened come last. It is kept on the EmbedKit server for each user, under the `userId` you pass to `BoomiPlugin()` or, without one, an id kept in the browser (see [BoomiPlugin options](./ConfigurationReference.md#1-boomiplugin--initialization-options)).
- There is no Updated option: Boomi records no update date for an installed integration.
- Created and Last viewed need the matching `@boomi/embedkit-sdk` and EmbedKit server. With an older server the list loads in its default order and the two options are not offered.
- Choose and order the options with `integrations.sort.options`, and start sorted with `integrations.sort.default`, for example `{ by: 'lastViewed', dir: 'desc' }`.

### Going back to the list

Opening an integration replaces the list, and going back builds it again. EmbedKit now remembers where the user was: the page, and (where the filter button shows) the filters, for the length of the browser tab, so a new tab starts on page 1. The search is not remembered: after a search, going back shows page 1 with the same filters and an empty search. If the remembered page no longer exists, the last page is shown. The sort choice is remembered in the browser until it changes, so it also survives a reload.

### Filter

A filter icon sits to the right of the search box (`integrations.filter.show`). It opens a panel with two groups:

- **Environment.** Environments the listed integrations are attached to. The group only appears when there is at least one.
- **Connector.** The connector types the listed packs use, with their icons.

Several options in one group match any of them; choices in both groups must both match. The icon shows how many filters are active, and **Clear filters** removes them all. Filtering runs on the server across the whole list and returns to page 1. Filter options load the first time the panel opens, and again after the search text changes.

---

## 4. The Add Integration catalog

At 1.7, **Add Integration** opens a searchable catalog (`form.addIntegration.layout: 'catalog'`); before 1.7 it opens the dropdown form (`'form'`). Either layout can be chosen explicitly on any component.

- **Cards.** Catalog cards are the same cards as the main list: same markup, width and title size. They show "Installed in N environments" when the pack is already installed.
- **Install.** Each card has an **Install** button (`form.addIntegration.catalog.installButton.show`, default `true`). Turn it off and clicking the card starts the install instead. The table view always shows the button. Change the text with `installButton.label`.
- **Search and filter.** Search matches pack names, descriptions and connectors. The filter icon beside the search box works like the main list's; in the catalog the environment filter keeps packs that are already installed in that environment (`form.addIntegration.catalog.filter.show`, which follows `integrations.filter.show`).
- **Size.** The modal fits `--boomi-catalog-columns` cards across (default 3). On a narrower screen the cards shrink instead of dropping a column; on phones they stack.
- **Paging.** The catalog is paged and searched on the server (`catalog.pageSize`, default 12, maximum 100). Connector icons are resolved only for the visible page.

### The install step

Choosing a pack opens the install step: the selected card, the environment to install into, and the instance name for multi-install packs.

| Option (`form.addIntegration.…`) | Default | Effect |
|---|---|---|
| `showEnvironmentSelect` | `true` | `false` installs into `defaultEnvironmentId` without asking. |
| `defaultEnvironmentId` | `environmentSelect.environmentId` | Environment to preselect or use when the selector is hidden. |
| `hideEnvironmentSelectWhenSingle` | `false` | Hide the selector when only one environment is available. |
| `showTargetEnvironment` | `true` | Show "Installing into *Environment*" in the selected card (`targetEnvironmentLabel` changes the label). |
| `allowDuplicateIntegrationNames` | `false` | Allow an instance name that is already used. |

For **single-install** packs the environment list leaves out environments that already have the pack, preselects when one remains, and disables Install when none do. That prevents duplicate instances.

---

## 5. After install: the setup wizard

After an install, agents open **Run Agent** and every integration, **single-install packs included**, opens the setup wizard. The same wizard opens from a card's Edit.

The wizard has up to three steps: **Make Connections**, **Map Fields** and **Set Schedule / Run**. When [Cross Reference Tables](#10-cross-reference-tables) is turned on, a **Cross Reference Tables** step sits between Map Fields and Set Schedule / Run. Before it opens, it checks the integration and leaves out:

- **Make Connections** when there are no connections and no process properties to set;
- **Map Fields** when there are no maps.

**Set Schedule / Run** is always the last step. If a check fails, the step is kept so the step itself can show the error.

A schedule is optional. An integration with none opens this step empty, with an **Add** button, and finishing the step without adding one saves no schedule. To remove every schedule, delete the cards and save (this needs the updated EmbedKit server).

Single-install packs keep their settings in one record for the whole environment, shared by every single-install integration installed there. **Edit Connections** (and the connections step of the setup wizard) lists only the connections and process properties of the integration's own processes, the same as a multi-install integration, so another integration's settings never show and a save changes only the values shown. This needs the matching `@boomi/embedkit-sdk` and EmbedKit server releases; the connections request has the same fields in every EmbedKit version from 1.5.1 on and the server answers them all the same way. The `isSingleInstall` field that EmbedKit 1.7 and later send is still accepted (map requests still use it; for connections it no longer changes the answer). Versions before 1.7 rejected single-install connections with `Code [1004]`.

### Default mappings

During install the server copies the publisher's default mappings into the new instance's maps, so **Map Fields** opens with them drawn. The result is reported through the `map.defaults.seeded` event (`seeded`, `skipped`, `failed`). A failed map simply opens undrawn; check `failed[].error` for the platform's reason.

---

## 6. Limiting environments

There are two layers. The **session scope** limits everything the session can see; the **UI options** limit what a single component offers.

### Session scope (login)

Your server sends the login body to `POST /api/v1/auth/login`. Add `environments` to limit the session:

```js
const LOGIN_BODY = {
  url, parentAccountId, childAccountId, accountGroup, apiUserName, apiToken,
  environments: ['19f7dd46-d6e7-4ef4-a7aa-11373222ab6c', '743851be-51d1-4fec-a1fd-df141c77d1d9'],
};
```

| Effect of `environments` | |
|---|---|
| Environment dropdowns | Only the listed environments. |
| Integrations list | Only instances attached to at least one listed environment. Each instance's `environments` holds only its in-scope attachments. |
| Add Integration catalog | Installed counts and "Installed in N environments" count only listed environments. |
| Filters | Environment options come from the listed environments only. |
| Validation | Login fails with `422 Environment scope invalid: <ids>` when an id is not an environment of the child account. |

Omit `environments`, or send an empty array, for every environment in the child account. The scope is stored with the session's credentials and replaced on every login. To change it, log in again.

### Per-component options

| Option (`components[key].…`) | Values | Effect |
|---|---|---|
| `environmentSelect.includeEnvironments` | `'ALL'` (default), `'PROD'`, `'TEST'` | Which classifications environment dropdowns list. `'ALL'` lists every environment, including ones the platform reports without a classification. |
| `environmentSelect.environmentId` | environment id | Dropdowns list only this environment; also the default install target. |
| `environmentSelect.onlineOnly` | `true` / `false` (default `false`) | Dropdowns list only environments whose runtime is ONLINE. The server checks every environment before it pages the list. Without it, dropdowns skip the runtime check and load faster. |
| `form.addIntegration.showEnvironmentSelect` + `defaultEnvironmentId` | `false` + id | Always install into one environment without asking. |
| `form.addIntegration.hideEnvironmentSelectWhenSingle` | `true` | Hide the dropdown when only one environment is available. |

These options narrow what one component offers. They never widen the session scope.

---

## 7. Flags reference

Defaults depend on the component's `uiVersion`. All paths are under `components[componentKey]`.

| Flag | Type | Before 1.7.0 | At 1.7.0+ | What it does |
|------|------|--------------|-----------|--------------|
| `uiVersion` | `string` | — | — | Release whose UI the component renders. |
| `integrations.integration.showType` | `boolean` | `true` | `false` | Type row on cards (main list and catalog). |
| `integrations.integration.editButton.show` | `boolean` | `true` | `false` | Edit button on integration cards; off makes the card open Edit. |
| `integrations.integration.editButton.label` | `string` | `'Edit'` | `'Edit'` | Edit button and menu item text. |
| `integrations.integration.showEdit` | `boolean` | `true` | `true` | `false` turns editing off entirely. |
| `integrations.integration.showControls` | `boolean` | `true` | `true` | The ⋮ actions menu. |
| `integrations.integration.showEnvironment` | `boolean` | `false` | `true` | Environment row on cards and the table's Environment column. |
| `integrations.integration.unattachedLabel` | `string` | `'Unattached'` | `'Unattached'` | Text of the pill for integrations attached to no environment. |
| `integrations.integration.showConnectors` | `boolean` | `false` | `true` | Connector icons on cards; the list only requests them when on. |
| `integrations.integration.connectorIconSize` | `number` | `36` | `36` | Connector icon size in px. |
| `integrations.filter.show` | `boolean` | `false` | `true` | Filter icon beside the list's search box. |
| `integrations.table.sortable` | `boolean` | `false` | `true` | Sortable table headers. |
| `integrations.sort.show` | `boolean` | follows `integrations.table.sortable` | follows `integrations.table.sortable` | Sort by menu beside the grid/table toggle. |
| `integrations.sort.options` | `string[]` | all five | all five | Options the menu offers, in order: `'name'`, `'description'`, `'environment'`, `'created'`, `'lastViewed'`. |
| `integrations.sort.default` | `{ by, dir }` | none | none | Starting sort, for example `{ by: 'lastViewed', dir: 'desc' }`. A choice the user already made wins. |
| `form.addIntegration.layout` | `'catalog' \| 'form'` | `'form'` | `'catalog'` | Add Integration experience. |
| `form.addIntegration.catalog.showType` | `boolean` | follows `showType` | follows `showType` | Type row on catalog cards. |
| `form.addIntegration.catalog.installButton.show` | `boolean` | `true` | `true` | Install button on catalog cards; off makes the card start the install. |
| `form.addIntegration.catalog.installButton.label` | `string` | `'Install'` | `'Install'` | Install button text (cards and table). |
| `form.addIntegration.catalog.filter.show` | `boolean` | follows `integrations.filter.show` | follows `integrations.filter.show` | Filter icon in the catalog. |
| `form.addIntegration.catalog.defaultView` | `'grid' \| 'table'` | `'grid'` | `'grid'` | Initial catalog view. |
| `form.addIntegration.catalog.showViewToggle` | `boolean` | `true` | `true` | Card/table switch. |
| `form.addIntegration.catalog.pageSize` | `number` | `12` | `12` | Packs per catalog page (max 100). |
| `form.addIntegration.catalog.connectorIconSize` | `number` | `36` | `36` | Catalog connector icon size in px. |
| `form.addIntegration.catalog.searchPlaceholder` | `string` | built-in | built-in | Catalog search placeholder. |
| `form.addIntegration.showTargetEnvironment` | `boolean` | `true` | `true` | "Installing into" panel on the install step. |
| `form.addIntegration.hideEnvironmentSelectWhenSingle` | `boolean` | `false` | `false` | Hide the environment dropdown when only one is available. |
| `environmentSelect.includeEnvironments` | `'ALL' \| 'PROD' \| 'TEST'` | `'ALL'` | `'ALL'` | Environment classifications offered. |
| `environmentSelect.environmentId` | `string` | — | — | Offer only this environment. |
| `environmentSelect.onlineOnly` | `boolean` | `false` | `false` | Offer only environments whose runtime is ONLINE. |
| `crossReferenceTables.enabled` | `boolean` | `false` | `false` | Turns on [Cross Reference Tables](#10-cross-reference-tables): the menu item, the setup wizard step and the Map Fields link. Only `true` counts. |
| `crossReferenceTables.menuLabel` | `string` | `'Edit Cross Reference Tables'` | `'Edit Cross Reference Tables'` | Text of the item in the integration's ⋮ menu. |
| `crossReferenceTables.title` | `string` | `'Cross Reference Tables'` | `'Cross Reference Tables'` | Screen title and wizard step name. |
| `crossReferenceTables.unavailableTables` | `'disabled' \| 'hidden'` | `'disabled'` | `'disabled'` | A table that cannot be edited here is listed greyed out with the reason, or left out. |
| `crossReferenceTables.wizardStep` | `boolean` | `true` when enabled | `true` when enabled | Only `false` removes the step from the Edit wizard. |
| `crossReferenceTables.showHistory` | `boolean` | `true` | `true` | Only `false` hides the "Last saved" line and makes no request for it. |

Login body (not `boomi.config.js`): `environments: string[]` sets the session scope (see [section 6](#6-limiting-environments)).

---

## 8. Customizing the look

Everything in these components is styled through `--boomi-*` CSS variables, so you can restyle it from `boomi.config.js` without touching EmbedKit's CSS. Set variables globally in `cssVars`, per theme in `cssVarsByTheme`, or per component in `cssVarsByKey`:

```js
cssVarsByKey: {
  integrationsPage: {
    '--boomi-integration-card-width': '18rem',
    '--boomi-integration-card-title-font-size': '1.0625rem',
    '--boomi-integration-card-env-unattached-bg': '#fee2e2',
    '--boomi-integration-card-env-unattached-fg': '#b91c1c',
    '--boomi-filter-badge-bg': '#0f766e',
    '--boomi-catalog-columns': '4',
  },
},
```

| Area | Token family | Class hooks |
|------|--------------|-------------|
| Integration cards | `--boomi-integration-card-*` (width, title, description, environment row, unattached pill, focus ring, connectors) | `.boomi-integration-card` and its `__header`, `__type`, `__title-row`, `__title`, `__menu`, `__desc`, `__connectors`, `__footer`, `__env-row`, `__env`, `__env--unattached`, `__actions`, `__edit`; `--clickable`, `--ui-1-7` |
| List grid and toolbar | `--boomi-integration-grid-*`, `--boomi-list-toolbar-gap`, `--boomi-list-toolbar-padding`, `--boomi-list-search-padding` | `.boomi-integration-grid`, `.boomi-list-search` |
| Integrations table | `--boomi-integrations-table-*` (radius, shadow, header and cell padding, fonts, column widths) | `.boomi-integrations-table`, `__th--name/--description/--environment/--history`, `__td--…` |
| Sorting | `--boomi-sort-icon-size`, `--boomi-sort-icon-opacity`, `--boomi-sort-active-fg` | `.boomi-sort`, `.boomi-sort--active`, `.boomi-sort__icon` |
| Filter | `--boomi-filter-*` (button, badge, panel, legend, options) and the menu tokens | `.boomi-filter`, `__button`, `__badge`, `__panel`, `__group`, `__legend`, `__option` |
| Catalog | `--boomi-catalog-*` (columns, search width, grid gaps, table, installed bar, Install button) | `.boomi-catalog-item`, `.boomi-catalog-grid`, `.boomi-catalog-toolbar`, `.boomi-catalog-table`, `.boomi-catalog-card__select` |
| Connector icons | `--boomi-connector-icon-*` | `.boomi-connector-icon`, `.boomi-connector-stack` |
| Scrollbars (1.7) | `--boomi-scrollbar-*` | — |
| Setup wizard | `--boomi-wizard-loading-padding` | `.boomi-wizard-loading` |
| Map Fields search | `--boomi-map-search-*` (row, Prev / Next, count, hit outline and ring) | `.boomi-map-search`, `.boomi-map-search-nav`, `.boomi-map-search-btn`, `.boomi-map-search-count`; cards get `.is-search-hit` / `.is-current-hit` |
| Searchable dropdown | `--boomi-options-search-*`, `--boomi-options-searchable-max-height` | `.boomi-options--searchable`, `.boomi-options-search`, `.boomi-options-search-input` |
| Cross Reference Tables | `--boomi-crt-*` (text, borders, headers, row stripes, focus, key warnings, find matches) | `.boomi-crt-screen`, `.boomi-crt-grid`, `.boomi-crt-chip`, `.boomi-crt-savebar` and the other `.boomi-crt-*` classes |

Every token, with its default, is listed in [ConfigurationReference.md → CSS Design Tokens](./ConfigurationReference.md#9-css-design-tokens). Defaults reproduce the shipped look, so you only set what you want to change.

---

## 9. Server API for list sorting and filtering

The EmbedKit UI calls these for you. They are documented for hosts that call embedkit-server directly.

### `GET /api/v1/integration-packs`

| Parameter | Type | Description |
|---|---|---|
| `renderType` | `agent \| integration \| all` | Which packs to list. |
| `search` | string | Matches instance and pack names. |
| `page`, `pageSize` | number | 1-based page; page size up to 100 (default 12). |
| `includeConnectors` | boolean | Attach `connectors[]` to each instance on the page. |
| `sortBy` | `name \| description \| environment` | Order of the whole list before paging. |
| `sortDir` | `asc \| desc` | Default `asc`. |
| `filterEnvironmentIds` | comma-separated ids | Keep instances attached to any of these environments (within the session scope). |
| `filterConnectorTypes` | comma-separated types | Keep instances whose pack uses any of these connector types. |
| `includeFacets` | boolean | Add `facets: { environments: [{ id, name, classification }], connectors: [{ type, displayName, iconKey, iconUrl }] }`, computed before the environment and connector filters. |

Each instance carries `environments: [{ id, name, classification }]` (in-scope attachments; an empty array means unattached) and `environmentId` (the first of them).

### `GET /api/v1/integration-packs/eligible`

Takes `renderType`, `notAllowedIds`, `search`, `page`, `pageSize`, `includeConnectors` and the same `filterEnvironmentIds` (packs installed in those environments), `filterConnectorTypes` and `includeFacets`.

---

## 10. Cross Reference Tables

A cross reference table is a lookup table that the publisher of an integration ships with it, for example one that turns a code from one system into the value another system expects. Every customer starts with the publisher's default rows and can keep their own copy. The **Cross Reference Tables** screen lets your users read the defaults and edit their own copy without leaving your app.

It is opt-in, and it needs the matching `@boomi/embedkit-sdk` and EmbedKit server releases (see [Requirements and older servers](#requirements-and-older-servers)). It is part of the Integration method (npm); the CDN embed does not include it.

### Turning it on

```js
// boomi.config.js
export default {
  components: {
    integrationsPage: {
      renderType: 'integration',
      crossReferenceTables: { enabled: true },
    },
  },
};
```

Off, or not set, this feature changes nothing for your users (the integration card layout changes in the same release apply to every embed, see the release notes). The feature does not depend on `uiVersion`. The other options (`menuLabel`, `title`, `unavailableTables`, `wizardStep` and `showHistory`) are in the [flags reference](#7-flags-reference) and in the [Configuration Reference](./ConfigurationReference.md#cross-reference-tables-crossreferencetables).

### Where it appears

| Entry point | What the user sees |
|---|---|
| The integration's ⋮ menu | **Edit Cross Reference Tables** (change the text with `menuLabel`), after **Edit Map(s)**. It opens the screen for that integration. **Cancel** or the **My Integrations** breadcrumb goes back to the list. |
| The setup wizard (after install, and from **Edit**) | A **Cross Reference Tables** step between **Map Fields** and **Set Schedule / Run**. `wizardStep: false` removes it. It is shown for every integration while the feature is on, so a pack without editable tables shows "No editable cross reference tables". |
| Map Fields | **Open Cross Reference Table** in the menu of a Cross Ref Lookup card opens the screen with that table selected, in the process of the map that is open when that process has the table. Only a lookup that names its table directly has it; a lookup inside a User Defined function does not. In the setup wizard it moves to the **Cross Reference Tables** step, so with `wizardStep: false` the wizard's Map Fields step does not show it (the **Edit Map(s)** screen still does). If the table cannot be opened here, for example because it cannot be edited, the first table opens with a short note. |

### Choosing a process and a table

Each process of an integration keeps its own copy of a table, so the screen works on one process at a time. Pick a **Process**, then a **Table**.

- **Process.** Lists the integration's own processes (sub-processes never appear). A process with no table is listed but cannot be chosen. With only one process the dropdown is disabled.
- **Table.** Lists the tables of the chosen process, sorted by name with numbers by value ("Table 2" before "Table 10"). Each option shows the process, whether the table is **Default** or **Overridden**, and its row count. A small dot marks a table, and its process, that has unsaved edits. A table that cannot be edited here (it is runtime specific, its definition cannot be read, it is not a cross reference table, or its format is not supported) is greyed out with the reason, for example "It is runtime specific, which an override cannot hold.", or left out when `unavailableTables` is `'hidden'`.
- **Chips.** Under the dropdowns: **Shared with: ...** when other processes of the integration use the same table; **Match: Exact**, **Wildcard** or **Regex**, which is how the table matches a value and is set by the publisher; **Default** or **Overridden**; warning chips for key problems; and the row and column count.

### Editing

- **Read only first.** A table opens showing the publisher's default rows, read only. Trying to edit one shows "Read only. Press Override to edit." **Override** creates your own copy to edit. From then on it no longer follows later changes to the defaults.
- **A spreadsheet in the page.** Arrow keys and Tab move, Enter, F2 or typing edits a cell, and Esc cancels. Copy, cut and paste work with spreadsheets (tab separated text). Rows can be added, inserted above or below, duplicated, moved up or down, deleted, and pasted above or below, from the toolbar, from the right-click menu (or the Menu key) or from the keyboard. Deleting two or more rows asks first.
- **Undo, find, full screen.** Undo and redo; find and replace (Ctrl or Cmd+F), with options to match case, match the whole cell and use a regular expression; and a full screen view that Esc leaves. The keyboard icon at the end of the toolbar opens a **Keyboard shortcuts** window with every key and mouse gesture.
- **Key warnings.** The first column is the key. When a key is blank, or appears in more than one row (compared ignoring case), a chip such as "1 blank key" or "2 duplicate keys" shows. Pressing it jumps to the next flagged row. Warnings do not stop a save.
- **What cannot change.** The column headers and the match type come from the publisher. A table has at most 20 columns and 10,000 rows ("A table can hold at most 10,000 rows.").
- **Reset to defaults.** Once a table is overridden, **Reset to defaults** replaces **Override**. It asks first, then shows the defaults again. Nothing is written to Boomi until the user saves, and the save button then reads **Restore defaults**.

### Saving

The bar under the grid says what the button will do: "No changes to save", "Save will create your own copy (12 rows)", "3 rows changed", "Row order changed" or "Save will restore the default values". The button is disabled when there is nothing to save, and reads **Restore defaults** after a reset.

**Save** writes the whole open table for the open process and reads it back, so the screen shows what Boomi now holds. A toast confirms it ("Table saved." or "Default values restored."). While a save runs, a small wait window covers the whole screen. A table that is too large for the server is refused before anything is sent: "This table is about 9.3 MB, which is over the 8 MB limit for saving. Remove some rows or shorten long values." The limit is the server's `CRT_SAVE_BODY_LIMIT_MB` (see [Server settings](#server-settings)).

#### Tables shared by several processes

When other processes of the same integration use the same table, **Save** becomes a split button: **Save to this process**, and an arrow with **Save to other processes that share this table...**. The arrow opens a confirmation that lists each other process with what will happen there:

- "Has unsaved changes, which will be replaced."
- "Has its own different rows, which will be replaced."
- "Uses the publisher defaults and will get its own copy."
- "Already has these rows." (listed, but not ticked)

Every process that has something to change is ticked, and the confirm button says how many processes will be written, this one included (for example **Save to 3 processes**). The saves then run one after another, and each process shows Waiting, Saving, Saved or Failed, with the reason when it failed. A button such as **Retry 2 failed processes** tries the failed ones again, except a process whose table someone else changed after it was loaded: its line says to close the window, reload the table and save again, because the same attempt would fail the same way. Nothing is rolled back: a process that was saved stays saved. A process where the table cannot be edited is not offered.

Restoring defaults works the same way, with **Restore defaults in this process** and **Restore defaults in other processes that share this table...**. Its lines there are "Has its own rows, which will go back to the defaults." and "Already uses the defaults."

**Single-install integrations.** A single-install integration keeps one copy of each table for the whole environment, not one per process. A table that two of its processes use is therefore the same table: there is no **Save to other processes** item, **Save** is a plain button, and saving or restoring it in one process changes it in all of them (the other processes' tables update on the screen at once, unless they have unsaved edits). The same holds across integrations: two single-install integrations installed in one environment that use the same table share one copy, so a change made in one shows in the other.

#### When someone else changed the table

If the table was changed after your user opened it (in Boomi, or by another user of your app), saving shows **This table was changed** with three choices:

- **Overwrite** saves your user's rows and replaces the other version.
- **Reload table** shows the other version and discards the unsaved edits to this table.
- **Keep editing** closes the prompt, for example so the user can copy their rows out first.

In a shared save, a process that was changed shows as failed with "Changed by someone else after it was loaded. Close this window, reload the table and save again."

#### Other failures

A failed save shows a **Could not save** dialog with one plain sentence, for example "Another save of this table is still running. Try again in a moment.", "Boomi is busy right now. Try again in a moment.", "This table is no longer part of this process, so it cannot be saved. Reload the screen." or "Boomi accepted the save but the table does not read back as saved. Check the table and try again." If Boomi rejects a save, check that the API token your server uses can edit environment extensions.

### The "Last saved" line

Under the chips one quiet line says when the open table was last saved and by whom: `Last saved by <email> on <date>`, or `Defaults restored by <email> on <date>` after a restore. The date and time follow the viewer's own locale. When no user is known the line reads `Last saved on <date>`. It reloads after every save or restore.

It is built from two records: the EmbedKit server's own record of saves made through the plugin (kept per table), and the last save that Boomi recorded for the environment.

- **Boomi records saves per environment, not per table.** For a table the plugin has a record of, the line uses that record's time. If Boomi shows a newer save made in its own user interface, someone else changed the environment since, and that save is shown instead. For a table with no record from the plugin, the line comes from Boomi's last save of the environment, and only for a table that has rows of its own. Hovering a line that comes from Boomi alone says "Boomi records this for the whole environment, not for one table."
- **The user is the account the server uses to talk to Boomi.** A save made through the plugin is recorded by Boomi under the account whose API token your EmbedKit server uses, so for a host with one service account the line names that account. A save made in the Boomi user interface names the person. If you would rather not show that name, set `showHistory: false`.
- **The name needs the Boomi right to view audit logs.** Without it the user may be missing: the line then falls back to the `userId` you pass to `BoomiPlugin()`, if any, and shows no name otherwise.
- **Nothing is shown when the server cannot say**: an older server, a failure, or nothing recorded. With `showHistory: false` the screen makes no request for it.

### In the setup wizard

In the wizard the step shows the same screen without its own **Cancel** button, because the wizard has its own **Back**, **Cancel** and **Next**. The tables load the first time the step is shown. **Next** does not save: the user saves with the step's own **Save**.

If any table has unsaved edits, **Next**, **Back**, **Cancel** and the breadcrumb first ask **You have unsaved changes** with **Discard and continue** or **Keep editing**. Discarding throws away the edits to every table. While a save is running, or its confirmation or conflict prompt is open, the wizard stays on the step.

### Where tables come from

The tables listed are the ones the publisher marked overrideable on the **top-level published process** (the Cross Reference tab of the process's Extensions dialog). Where a table is used does not matter: a table used only inside a sub-process is listed if it is ticked on the top-level process. Sub-processes never appear in the **Process** dropdown, only the integration's own processes do.

Publishers: tick the tables on the top-level published process, not only on a sub-process. Which tables a customer can edit is decided in the publisher's account, not by EmbedKit configuration.

### Requirements and older servers

- **Matching releases.** Publish `@boomi/embedkit-sdk` first, then deploy embedkit-server, then upgrade EmbedKit, the same order as the [upgrade checklist](#11-upgrade-checklist).
- **An older server.** With the feature on and a server that does not have it (or runs an older SDK), the screen shows **Could not load cross reference tables**: "This server does not support cross reference tables yet. Update the embedkit server and try again." It has a **Try again** button, and the "Last saved" line never appears.
- **Boomi rights.** Saving needs an API token that can edit environment extensions. User names in the "Last saved" line need the right to view audit logs.

### Server settings

All optional. They are set as environment variables on the EmbedKit server.

| Setting | Default | What it does |
|---|---|---|
| `CRT_SAVE_BODY_LIMIT_MB` | `8` (minimum `1`) | Largest request the save accepts, in MB. Every other route keeps 1 MB. The screen reads this limit from the server. |
| `CRT_SAVE_LOCK_WAIT_SECONDS` | `10` | How long a save waits for another save in the same customer account and environment to finish before it answers that another save is still running. `0` tries once. |
| `CRT_SAVE_LOCK_TTL_SECONDS` | `120` (minimum `10`) | How long the lock of a save, one per customer account and environment, lasts if the server never releases it (for example because it stopped mid-save). Set it longer than your slowest save: a save that is still running when its lock ends no longer holds it. |
| `CRT_HISTORY_CACHE_SECONDS` | `60` | How long the answer taken from Boomi's audit log (the last save of an environment) is reused. `0` turns the reuse off. The reuse is kept per server instance: a save drops it at once on the instance that handled the save, and for the next 30 seconds that instance asks Boomi on every read and keeps nothing, because Boomi's audit log can take a moment to show the save. With several instances the others can serve the older answer until it ends. |
| `CRT_DEFINITION_CACHE_MB` | `64` | Memory the server may use to keep table definitions (headers and default rows) it has read from the publisher's account. `0` turns the cache off. |
| `CRT_DEFINITION_FRESH_SECONDS` | `30` | How long a kept definition is used before the server checks whether the publisher changed it. `0` checks on every request. |

### Events, dialogs and look

Saving or restoring emits `crossReference.table.saved` or `crossReference.table.reset` once for each process written, with ids and counts only and never cell values (see [Events & Callbacks](./ConfigurationReference.md#10-events--callbacks)). The confirmations for leaving with unsaved edits, **Reset to defaults**, deleting several rows and the wizard's unsaved edits use the standard confirm dialog, so your `confirm` handler covers them, with `source.componentName` set to `'CrossReferenceTables'` (see [Cross reference table confirmations](./ConfigurationReference.md#cross-reference-table-confirmations)). The wait window, the conflict prompt and the shared-table confirmation are built in and cannot be replaced. The colors come from the `--boomi-crt-*` tokens (see [Cross Reference Tables tokens](./ConfigurationReference.md#cross-reference-tables)).

---

## 11. Upgrade checklist

1. **Deploy in order.** Publish `@boomi/embedkit-sdk` first, then embedkit-server, then the EmbedKit UI or CDN bundle. The UI's catalog, filters and sorting need the new server routes, and the server needs the new SDK.
2. **Nothing changes until you opt in.** Existing components keep the 1.6.1 UI. Set `uiVersion: '1.7.0'` on one component, test it, then roll out.
3. **Allow connector icons.** Pages with a strict `img-src` Content Security Policy must allow the Boomi platform host (for example `https://api.boomi.com`), or icons fall back to EmbedKit's own glyphs.
4. **Pin the CDN version.** The CDN quick start loads an unversioned URL, which always serves the latest release. Pin a version (`@boomi/embedkit-cdn@1.7.0`) so future releases reach you only when you choose.
5. **Changes that apply to everyone** (no opt-in): environment dropdowns set to `ALL` now list environments without a classification; single-install packs open the setup wizard and can edit connections; the wizard skips empty steps; screen titles fall back to the pack name; scroll areas no longer rubber-band. See the release notes.
6. **Cross Reference Tables is opt-in.** The feature changes nothing until you set `crossReferenceTables.enabled: true` on a component. The release also changes the integration cards for every embed (see the release notes). It needs the matching `@boomi/embedkit-sdk` and EmbedKit server releases, deployed in the order of step 1. Turn it on for one component, try it on an integration that has cross reference tables, then roll it out. Publishers must tick the tables on the top-level published process (see [Where tables come from](#where-tables-come-from)).
