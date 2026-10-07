# Boomi EmbedKit — Integrations Guide (1.7)

> How the integrations list, the Add Integration catalog and the setup wizard work in EmbedKit 1.7, how to limit which environments a session can use, and every flag that turns these features on or off. For the full option and token reference, see [ConfigurationReference.md](./ConfigurationReference.md). For what changed in this release, see [ReleaseNotes.md](./ReleaseNotes.md).

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
10. [Upgrade checklist](#10-upgrade-checklist)

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
| **Unattached** pill for integrations attached to no environment | Integrations list | wherever the environment is shown |
| Setup wizard skips steps with nothing to configure | After install and on Edit | always |
| Single-install packs use the setup wizard and can edit connections | After install and on Edit | always |
| Session environment scope (`environments` at login) | Login body | opt-in |

Anything marked "at `uiVersion` 1.7.0" stays off for a component until you set its `uiVersion` to `'1.7.0'` or later (see the next section). The rest are bug fixes or behavior that applies to every component.

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

The list is paged on the server, 12 per page.

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

The wizard has up to three steps: **Make Connections**, **Map Fields** and **Set Schedule / Run**. Before it opens, it checks the integration and leaves out:

- **Make Connections** when there are no connections and no process properties to set;
- **Map Fields** when there are no maps.

**Set Schedule / Run** is always the last step. If a check fails, the step is kept so the step itself can show the error.

Single-install packs keep their connection settings at the environment level rather than per process. EmbedKit 1.7 sends `isSingleInstall` with every connection and map request, so these load and save correctly. Earlier versions rejected them with `Code [1004]`.

### Default mappings

During install the server copies the publisher's default mappings into the new instance's maps, so **Map Fields** opens with them drawn. The result is reported through the `map.defaults.seeded` event (`seeded`, `skipped`, `failed`).

- **Maps that need a browse session.** Some maps use profiles the platform must browse with connection credentials (for example an LDAP password). They can't be saved until the connection is configured, so the install skips them (`skipped[].reason: 'needs-browse-session'`). When the user opens **Map Fields** and authenticates the browse, the defaults are copied right away and `map.defaults.seeded` fires again for those maps.
- **Qualified paths.** A default mapping that addresses a qualified element, such as `Address[Name='Work']/City`, has no matching node in the extension profile. It is left out and listed in `seeded[].omitted`; the user maps it by hand. A map whose defaults are all qualified is skipped (`only-qualified-paths`).
- **Never overwritten.** A map that already has customer mappings is left alone (`already-extended`).
- **Failures.** A failed map simply opens undrawn; `failed[].error` carries the platform's reason. The install itself never fails because of the copy.

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

## 10. Upgrade checklist

1. **Deploy in order.** Publish `@boomi/embedkit-sdk` first, then embedkit-server, then the EmbedKit UI or CDN bundle. The UI's catalog, filters and sorting need the new server routes, and the server needs the new SDK.
2. **Nothing changes until you opt in.** Existing components keep the 1.6.1 UI. Set `uiVersion: '1.7.0'` on one component, test it, then roll out.
3. **Allow connector icons.** Pages with a strict `img-src` Content Security Policy must allow the Boomi platform host (for example `https://api.boomi.com`), or icons fall back to EmbedKit's own glyphs.
4. **Pin the CDN version.** The CDN quick start loads an unversioned URL, which always serves the latest release. Pin a version (`@boomi/embedkit-cdn@1.7.0`) so future releases reach you only when you choose.
5. **Changes that apply to everyone** (no opt-in): environment dropdowns set to `ALL` now list environments without a classification; single-install packs open the setup wizard and can edit connections; the wizard skips empty steps; screen titles fall back to the pack name; scroll areas no longer rubber-band. See the release notes.
