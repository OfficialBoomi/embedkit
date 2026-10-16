# EmbedKit — Release Notes

> This page tracks public releases of **Boomi EmbedKit**. For installation and upgrade steps, see [GettingStarted.md](./GettingStarted.md).

---

### Latest

![Version](https://img.shields.io/badge/version-v1.7.3-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge)

---

### All Releases

<details open>
  <summary><strong>v1.7.3</strong>: Dialog handlers for your own confirm, alert and toast dialogs; Map Fields shows errors when a credential check fails</summary>

  **Upgrade notes**
  - Dialog handlers are opt-in and UI only: nothing changes until you register a handler, and the built-in dialogs behave exactly as before. No server or SDK change is needed for them.
  - The Map Fields error messages are UI only: they apply after upgrading the UI / CDN bundle and need no server change.
  - **Server, recommended:** deploy `embedkit-server` **1.4.4** (built on `@boomi/embedkit-sdk` **1.5.4**). Map Fields waits for an install's default mappings (see below), and the server answers a credential check for an offline runtime after 25 seconds instead of leaving the request to time out, and it no longer returns the typed password in the response. Optional setting: `MAP_BROWSE_TIMEOUT_MS` (default `25000`, `0` turns the limit off).

  **New (opt-in)**
  - ✅ **Dialog handlers:** Pass `dialogHandlers` to `BoomiPlugin` (or `window.BoomiEmbed` in the CDN embed) with a `confirm`, `alert` and/or `toast` function. EmbedKit calls your function instead of showing its own SweetAlert dialog or toast, so you can use your own component, for example Angular Material's `MatDialog`. For a confirm, EmbedKit waits for your answer and proceeds only when it is strictly `true`; `false`, `undefined`, an error or no answer cancels, and the built-in dialog is never shown as a fallback once a handler is registered.
  - ✅ **Close your dialog when EmbedKit gives up:** Every confirm and alert request carries an `AbortSignal`. EmbedKit stops waiting after `timeoutMs` (default 120 seconds) and aborts the signal so your dialog can close.
  - ✅ **`DialogHandlerRegistry`:** `set()`, `get()` and `clear()` register or remove handlers at any time without a reload. Exported from `@boomi/embedkit` and available as `BoomiEmbedKitCdn.DialogHandlerRegistry` in the CDN build.
  - ✅ **Which actions ask for confirmation:** Delete integration, Run Now, disconnect all mappings, delete transformation and delete agent chat. Each request says whether the action is `destructive`.

  **Changes for every embed** (no opt-in)
  - ✅ **Map Fields shows credential-check errors:** When checking a connection's password fails (the runtime is offline, the check times out, or a network or server error occurs), the "Credentials required" popup shows a message and keeps what you typed. Save is disabled while a check is running, and nothing is retried automatically. If the maps fail to load, Map Fields shows "Could not load maps" with a **Try again** button instead of "No Maps Found", and a failed map save shows a readable error.
  - ✅ **`errorDetail` from `useFetchMapExtensions`:** The hook also returns the underlying error, which can carry an HTTP `status` (`0` means no response arrived). Existing fields are unchanged.
  - ✅ **Confirmations open from the click:** Delete, Run Now, disconnect and delete-transformation confirmations are now opened by the click itself, so only one is open at a time and a second click while one is open is ignored. Confirmations in the mapping canvases act on the map as it is when you answer, not as it was when the dialog opened. The dialog looks and behaves the same.
  - ✅ **Map Fields waits for default mappings after an install:** The partner's default mappings are copied after an install finishes, so a map opened right away could show an empty canvas, and saving it could leave those defaults out. Opening or saving a map now waits for the copy to finish. Map Fields shows the usual loading state and retries on its own, a few times, if the copy is still running. Saves are held until the copy is done. This needs `embedkit-server` 1.4.4; with an older server nothing waits and behavior is unchanged.

  **Bug fixes**
  - 🐛 **Typed credentials were exposed after a failed check:** The values entered in the credentials popup were written to the browser console (production builds too) and, with an older server, returned in the check's response. The UI now logs only how many checks failed; the matching server stops returning them.
  - 🐛 **Map Fields could open empty right after an install:** Opening a map before the install's default mappings were copied showed an empty canvas, and saving that map could leave the defaults out for good. See *Map Fields waits for default mappings* above.

  **Server and SDK changes** (`embedkit-server`, `@boomi/embedkit-sdk`)
  - 🐛 **Execution History now shows the newest runs:** For integrations with many runs, the history could stop at an old date and showed at most 30 runs per pack. It now returns the newest 500 runs per integration pack, newest first, with no gaps or duplicates when runs share the same second. Hosted embeds get this when the server is updated; no UI upgrade is needed. If you run your own server, update `embedkit-server` and `@boomi/embedkit-sdk`. Optional settings: `EXECUTION_HISTORY_MAX_RUNS` (default `500`) and `EXECUTION_HISTORY_CACHE_SECONDS` (default `10`, `0` turns the cache off).
  - ✅ **SDK response fields:** `ExecutionSummaryRecordService` results can include the optional fields `totalFound`, `capped`, `maxRuns` and `partial`. Existing fields are unchanged. The default `maxRuns` for direct SDK callers changes from 30 to 500.

  See [Dialog Handlers](./ConfigurationReference.md#11-dialog-handlers) for the request fields, the failure rules and examples.

</details>

<details open>
  <summary><strong>v1.7.2</strong> — Map Fields: a map picker, an ordered function stack and search; integrations list fix for large account groups; default mappings for multi-install packs</summary>

  **Upgrade notes**
  - **Republished from 1.7.1:** the npm package for 1.7.1 contained no build output, so importing `@boomi/embedkit` (or `@boomi/embedkit/index.css`) failed. 1.7.2 is the same UI code as 1.7.1 with the full build. Upgrade from 1.7.1 to 1.7.2. The CDN bundle (`@boomi/embedkit-cdn`, `cdn.boomi.space`) goes straight from 1.7.0 to 1.7.2.
  - **Server first for the server fixes:** deploy `embedkit-server` **1.4.2** (built on `@boomi/embedkit-sdk` **1.5.2**). The large-account-group fix and the default-mapping fixes below are entirely on the server; the UI needs no change for them. This release does not change the EmbedKit UI's own `@boomi/embedkit-sdk` dependency.
  - The Map Fields changes apply to every embed after upgrading the UI / CDN bundle; they need no server change.

  **Changes for every embed** (no opt-in)
  - ✅ **Map picker** — **Map Fields** shows one dropdown of the integration's maps instead of a tab per map, with a search box that filters the list as you type (arrow keys and Enter pick a map).
  - ✅ **Ordered function stack** — The Transformations column lists the map's functions top to bottom in their saved order. Reorder them by dragging the grip or with the up / down buttons; each one collapses to a single row (they start collapsed), with **Expand All** / **Collapse All** next to **Add**.
  - ✅ **Search functions** — The Transformations column has the same search bar, **Prev** / **Next** and count as Sources and Targets. Enter highlights every function whose name, type or input / output names match, and expands and scrolls to the current match.
  - ✅ **Themeable search** — The search rows and the dropdown's search box are styled through `.boomi-map-search*` / `.boomi-options-search*` classes and `--boomi-map-search-*` / `--boomi-options-search-*` tokens. Defaults reproduce the shipped look. Dropdowns elsewhere are unchanged; search is opt-in per dropdown (`searchable`). See [Mapping canvas search](./ConfigurationReference.md#mapping-canvas-search--boomi-map-search).

  **Bug fixes**
  - 🐛 **Integrations list failed for account groups with more than 100 packs** — Since embedkit-server 1.4.0 (SDK 1.5.0), `GET /api/v1/integration-packs` and the Add Integration catalog returned `400 Bad Request` for such groups: the platform rejects paging (`queryMore`) for account-group pack links. SDK 1.5.1 keeps the first page, as before 1.4.0, and logs a warning. Fetching links past the first 100 is tracked separately.
  - 🐛 **Maps on the same objects mixed up their state** — Two maps whose source and destination object types matched shared one entry in Map Fields, so React reported duplicate keys and edits on one tab could show on the other. Each map is now keyed by its own extension id.
  - 🐛 **Switching maps left the old canvas** — Selecting another map now starts a fresh canvas for it instead of keeping the previous selection and lines.

  **Server and SDK changes** (`embedkit-server` 1.4.2, `@boomi/embedkit-sdk` 1.5.2)
  - 🐛 **Default mappings on multi-install packs** — The install-time seed failed with `ComponentId ... is invalid` for maps with a user-defined default, because each instance's process id matched no publisher component. The id is now mapped back to the publisher's process, and installed process names (`<pack> - <process>`) are matched correctly.
  - 🐛 **Maps in sub-processes got the wrong defaults** — A map was paired with the wrong map when its process had several maps or when it lived in a sub-process, so its defaults silently failed to seed. Each map is now matched to its own profile and user-defined functions; if no match is found, the seed reports it instead of guessing.
  - 🐛 **Cross Reference Lookup defaults rejected by the platform** — Default lookup steps were sent in the component-XML shape and failed with `400 Unable to read message body`. They are now sent in the platform's shape.
  - 🐛 **Maps that need a browse session no longer fail the install** — Maps whose profiles must be browsed (for example an LDAP password) are skipped at install with a clear reason instead of a platform `500`. Their defaults are copied in when the user browses the map (`mapDefaultsSeed` on the browse response). The browse itself never fails because of the seed.
  - 🐛 **Qualified default mappings no longer fail a map** — Defaults on qualified paths (such as `Address[Name='Work']/City`) have no node in the extension profile, so they are left out and reported as omitted. The rest of the map's defaults are still seeded.

</details>

<details open>
  <summary><strong>v1.7.0</strong> — Per-component UI versions, a new integrations list and Add Integration catalog, filtering and sorting, environment scope, and a smarter setup wizard</summary>

> Entries marked **(1.7 UI)** only appear on components that set `uiVersion: '1.7.0'`. Everything else applies to every embed after upgrading. The full walkthrough is in the [Integrations Guide](./IntegrationsGuide.md).

  **Highlights**
  - **Upgrade without surprises.** Each component keeps its 1.6.1 look until you set its `uiVersion`, so new UI is adopted one page at a time.
  - **Find integrations faster.** Filter by environment and connector, sort the table, and see each integration's environment, with **Unattached** ones flagged.
  - **Install from a catalog.** A searchable Add Integration catalog with platform connector icons, using the same cards as the main list.
  - **Limit environments per session.** Send `environments` at login and every list, dropdown and filter follows it.
  - **Shorter setup.** The setup wizard skips steps with nothing to configure, and single-install packs now go through it too.

  **Upgrade notes**
  - **Deploy order:** deploy `embedkit-server` 1.4.0 (built on `@boomi/embedkit-sdk` 1.5.0) before upgrading the EmbedKit UI / CDN bundle. The catalog, filters and sorting need the new server routes.
  - **Opt in per component:** existing components keep the 1.6.1 UI. Set `uiVersion: '1.7.0'` on a component to adopt everything marked **(1.7 UI)**, and use individual flags to adopt or skip single features. See [UI versions](./IntegrationsGuide.md#2-ui-versions-adopting-new-ui-per-component) and the [flags reference](./IntegrationsGuide.md#7-flags-reference).
  - **Content Security Policy:** host pages with a strict `img-src` must allow the Boomi platform host (for example `https://api.boomi.com`) for connector icons; otherwise EmbedKit falls back to its own glyphs.
  - **Pin the CDN version:** the CDN quick start loads an unversioned URL that always serves the latest release. Pin `@boomi/embedkit-cdn@1.7.0` to control when upgrades reach you.

  **Changes for every embed** (no opt-in)
  - ✅ **Single-install packs use the setup wizard** — Installing a single-install integration continues into the setup wizard like any other integration, instead of jumping to its schedules, and its connections can be viewed and edited (they were rejected with `Code [1004]`).
  - ✅ **The setup wizard skips empty steps** — Before it opens, the wizard leaves out **Make Connections** when there are no connections or process properties, and **Map Fields** when there are no maps. **Set Schedule / Run** is always last.
  - ✅ **Environment scope** — Send `environments: [ids]` in the login body to limit a session to those environments across environment dropdowns, the integrations list, the catalog and the filters. Login rejects unknown ids with `422`. Omit it for every environment. See [Limiting environments](./IntegrationsGuide.md#6-limiting-environments).
  - ✅ **Server-paged catalog** — The catalog is paged and searched on the server (`GET /integration-packs/eligible?page&pageSize&search`), connector icons resolve only for the visible page, platform lookups are chunked, and every list query follows `queryMore`.
  - ✅ **Everything is themeable** — Every new or changed component is styled through `--boomi-*` tokens with named `.boomi-*` classes, including the integrations and catalog tables, which no longer use hardcoded Tailwind utilities. Defaults reproduce the shipped look. See [Customizing the look](./IntegrationsGuide.md#8-customizing-the-look).
  - ✅ **Notice icon tokens** — `--boomi-notice-icon-size` and `--boomi-notice-icon-display` (set to `none` to hide) control the icon in notices and the modal `Dialog`. Defaults match the previous look.
  - ✅ **Search clear tokens** — `--boomi-search-clear-fg` and `--boomi-search-clear-hover-fg` color the clear (x) in search fields.
  - ✅ **Styling scope note** — `ConfigurationReference.md` now states that CSS variables are the supported way into the Shadow DOM.

  **New** (1.7 UI)
  - ✅ **Per-component UI version** — `components[key].uiVersion` picks the UI a component renders; explicit options still override it. See [UI version](./ConfigurationReference.md#ui-version-uiversion).
  - ✅ **Add Integration catalog** — A searchable catalog with card and table views, platform connector icons and "Installed in N environments". Catalog cards are the same cards as the main list. Each card has an **Install** button (`form.addIntegration.catalog.installButton`), or, with it off, the card itself starts the install; the table always shows the button. The modal fits three cards across (`--boomi-catalog-columns`). `form.addIntegration.layout: 'form'` keeps the dropdown form. See [Add Integration Catalog](./ConfigurationReference.md#add-integration-catalog-formaddintegration).
  - ✅ **Integration card layout** — No type row (`showType`), the actions menu at the right of the top visible row, a smaller title, connector icons (`showConnectors`), the environment in a full-width row (`showEnvironment`), and a fixed card width (`--boomi-integration-card-width`). The Edit button is off (`editButton.show`): the whole card opens Edit on click, Enter or Space, and **Edit** is the first item in the actions menu. Agent cards keep Run Agent. See [Integration cards](./ConfigurationReference.md#integration-cards-integrationsintegration).
  - ✅ **Filter and sort** — A filter icon beside the search box filters by environment and connector on the list and in the catalog (`integrations.filter.show`). The table view adds an Environment column and sortable Name, Description and Environment headers (`integrations.table.sortable`). Both run on the server across the whole list (`sortBy`, `sortDir`, `filterEnvironmentIds`, `filterConnectorTypes`, `includeFacets`). See [List filter and sorting](./ConfigurationReference.md#list-filter-and-sorting).
  - ✅ **Unattached integrations flagged** — An integration attached to no environment (detached in the platform, or an attach that failed during install) shows an orange **Unattached** pill on the card and in the table (`integrations.integration.unattachedLabel`). Needs embedkit-server 1.7.
  - ✅ **Install step shows the target** — "Installing into *Environment*" in the selected card, even when the dropdown is hidden (`form.addIntegration.showTargetEnvironment`); `hideEnvironmentSelectWhenSingle` hides the dropdown when only one environment is available.
  - ✅ **Thin scrollbars** — Scroll areas in the component use slimmer `--boomi-scrollbar-*` defaults (transparent track, pill thumb).

  **Bug fixes**
  - 🐛 **All environments listed** — Environment dropdowns set to `ALL` queried only environments classified PROD or TEST, so accounts whose environments have no classification saw just some of them (one of six in testing). `ALL` now lists every environment in scope, and `environmentSelect.environmentId` is honored with it.
  - 🐛 **Instances attached to several environments no longer collapse to one** — The list kept only the *last* attachment per instance, so Edit Connections / Maps / Schedules could act on the wrong environment. Instances now carry every in-scope attachment in `environments`; `environmentId` is the first.
  - 🐛 **`environmentSelect.includeEnvironments` now works** — the server expected a differently named parameter and always returned every classification.
  - 🐛 **Single-install connection lookups** — The wizard's connection step queried per process for single-install packs and failed with `400 extensionGroupId must be id for Multi-Install or Single-Install Integration Pack`. It now sends `isSingleInstall`, which reads the environment-level settings.
  - 🐛 **Screen titles** — Configure, Update Maps, Update Schedule(s) and Run Agent showed "undefined" for instances without an override name; they now show the pack name.
  - 🐛 **No scroll bounce** — Scroll areas stop at their ends instead of rubber-banding (macOS) or scrolling the host page.
  - 🐛 **Data hooks are importable** — The React data hooks (such as `useFetchEnvironments`) were described in the type declarations but missing from the published JavaScript, so importing one failed when bundling. All of them are now exported from `@boomi/embedkit`, including `useFetchEnvironmentExtensionConnectionStatus`, `useFetchOauth2Url`, `useFetchIntegrationPackInstance` and `useExecuteMapExtensions`. They must run inside `<EmbedKitProvider>`. See [Data Hooks](./GettingStarted.md#data-hooks-custom-ui).
  - 🐛 **Search clear (x) is centered in search fields** — The clear button was positioned with a Tailwind translate utility that does not apply inside the Shadow DOM, so it rendered below center. It now uses plain CSS.
  - 🐛 **No focus outline on the scrollable plugin area in Chrome** — Chrome drew a default focus border around the scrollable EmbedKit container when clicked or tabbed into. The container stays focusable and keyboard-scrollable; only the outline is removed.
  - 🐛 **Schedules error notice can be dismissed** — The close (x) on the "Error Updating Schedules" notice did nothing. It now closes the notice.

  **Known issues**
  - ⚠️ **Default mappings not copied for some maps** — On installing a pack whose maps use the *LDAP (Retired)* connector, two maps failed to receive the publisher's default mappings (platform 500 and 400). The install itself succeeds and the result is reported in `map.defaults.seeded`. 1.7.2's server fixes target this case; confirm on a fresh install of that pack before treating it as resolved.
  - ⚠️ **Single-install connection save** — Loading and editing single-install connections is verified; saving is still being tested.

</details>

---

<details>
  <summary><strong>v1.6.1</strong> — Partner default mappings on install, platform-function round-trip, opt-in convert-to-script</summary>

  **Bug fixes**
  - 🐛 **Partner default mappings now appear on a fresh install** — Opening **Edit Map(s)** on a newly installed integration pack used to show an empty canvas even when the publisher had pre-configured field mappings and functions on the map. The Boomi Platform only returns those defaults when asked (`X-BOOMI-includeDefaultMappings`, Integration release May 2026), and EmbedKit never asked. `@boomi/embedkit-sdk` **1.4.0** now copies every default mapping and function into the instance's environment map extensions **once, during install**, so they open as ordinary, editable mappings. The copy is idempotent (a map that already has extensions is left alone) and never fails the install; its outcome is emitted as the new `map.defaults.seeded` event. Default functions that reference the publisher's **user-defined functions** are recreated as environment-level functions on the customer's map, because the platform rejects a cross-account reference.
  - 🐛 **Saving a map no longer destroys platform-defined functions** — The mapping canvas only understood Custom Scripting functions: it read pins from `Configuration.Scripting` alone and rewrote every function as an empty script on save, so a map containing `CurrentDate`, `TrimWhitespace`, a user-defined function, etc. was corrupted on the first save and rejected by the platform. Those functions now load their pins from `Inputs`/`Outputs`, render with their connections, and are sent back **exactly as received**. They can be wired and deleted; **Edit** is hidden for them unless conversion is enabled (below).
  - 🐛 **Example dev harness console** — `index.example.js` now installs the in-page console interceptor and panel resizer that `index.example.html` and the harness docs already described; a fresh copy of the example previously showed an empty console.

  **New**
  - ✅ **Convert platform-defined functions to scripts (opt-in)** — With `updateMaps.convertFunctionsToScript: true` (default `false`), platform-defined functions of a convertible type gain an **Edit** action. Choosing it compiles the function to JavaScript **deterministically, without an LLM** (21 standard string/math/date types, plus user-defined functions flattened step by step), opens the result in the Transformation Editor, and emits `map.function.converted`. From then on it is a customer-owned scripting function the editor's AI assistant can change; saving replaces the partner's function. Functions that need platform services (lookups, properties, document cache) or cross-document state (`Count`, `Sum`, `RunningTotal`, `SequentialValue`, `LineItemIncrement`) and `NumberFormat` are not convertible and keep no Edit action. A Groovy scripting step inside a UDF is emitted as a commented TODO and flagged rather than translated. See [Transformation Editor § 11](./TransformationEditor.md#11-editing-platform-defined-functions-convert-to-script).
  - ✅ **Delete-restores-default note** — Update Maps shows a short note that removing a mapping restores the partner's default for that field (the default still lives on the map component). Configurable via `updateMaps.showDefaultsNote` / `updateMaps.defaultsNote`.
  - ✅ **New events** — `map.defaults.seeded` (per-map counts of what was copied, skipped or failed at install) and `map.function.converted` (function id, type, compiler warnings). See [All Event Types](./ConfigurationReference.md#all-event-types).
  - ✅ **Dependency** — Updated `@boomi/embedkit-sdk` to **1.4.0**. **Server:** `embedkit-server` must run 1.4.0 as well (`main` ≥ `d1f9fef`) for installs to seed and for the new `POST /api/v1/map-extensions/compile-function` route to exist; a client on 1.6.1 against an older server simply behaves as before.

  > **Existing installs are not back-filled.** Instances created before the server moved to SDK 1.4.0 keep their current (empty) map extensions. Re-installing the pack, or running the seed for that instance, brings the defaults in.

</details>

---

<details>
  <summary><strong>v1.6.0</strong> — Callback dialog &amp; toast theming</summary>

  **Bug fixes**
  - 🐛 **Six documented `--boomi-swal-*` tokens now actually work** — `--boomi-swal-title-fg`, `-desc-fg`, `-overlay-bg`, `-icon-success`, `-icon-warning`, and `-icon-error` were documented and offered in the Admin Console theme builder, but the dialog CSS read different (undocumented) legacy variable names instead, so setting them had no effect. They're now wired directly, falling back to those legacy names so existing configs that were already using them are unaffected.
  - 🐛 **Removed a hardcoded dialog background override** — `--boomi-swal-bg` had a hardcoded `rgba(0,0,0,0.9)` override that could silently beat your theme's configured value depending on style load order. This is now driven entirely by the theme, like every other dialog token. **This may be visibly different** if you were relying on the previous accidental value — see [SweetAlert Dialogs](./ConfigurationReference.md#sweetalert-dialogs).
  - 🐛 **Redis Admin dialogs are now themed** — the admin console's key-management confirm dialogs (delete key, revoke sessions, clear tenant/sub-account) previously bypassed the theming system entirely and always rendered unthemed. They now use the same themed dialog styling as the rest of the embed.
  - 🐛 **Multiple embeds on one page no longer fight over dialog/toast styling** — two EmbedKit mounts on the same page with different themes could have one mount's dialog or toast styling overwrite or strip the other's. Styling is now scoped per mount.

  **New**
  - ✅ **Dialog and toast font is themeable** — `--boomi-dialog-font` (falls back to the embed's overall `--boomi-font`) now applies to callback dialog titles, descriptions, and buttons, and to toast text. Previously dialogs/toasts silently inherited the *host page's* font instead of the embed's theme, since SweetAlert2's own CSS is `font-family: inherit` and nothing bridged the token across.
  - ✅ **New dialog typography/box-model tokens** — `--boomi-swal-title-font-size`, `-title-font-weight`, `-desc-font-size`, `-border-radius`, `-padding`, `-actions-gap`. Defaults match the previous hardcoded values exactly, so existing embeds look identical until you override them.
  - ✅ **New toast typography/layout tokens** — `--boomi-toast-font`, `-font-size`, `-font-weight`, `-line-height`, `-padding`, `-min-height`, `-icon-size`, and `-progress-display` (set to `none` to hide the timer progress bar). See [Toast Notifications](./ConfigurationReference.md#toast-notifications).
  - ✅ **`boomiConfig.dialogs` structural options** — `buttonOrder` (`'cancel-first'` default | `'confirm-first'`), `showIcon`, and `destructiveVariant` (renders the confirm button with a new `--boomi-btn-danger-*` token family for `warning`-type dialogs). None of these change functional behavior (button actions, callback payloads, dismiss/confirm logic) — see [Dialog Structural Options](./ConfigurationReference.md#dialog-structural-options).

</details>

---

<details>
  <summary><strong>v1.5.3</strong> — Event hooks for JS hosts (also v1.5.2)</summary>

  > v1.5.2 and v1.5.3 were published on the same day; v1.5.3 is the one to use.

  **Highlights**
  - ✅ **Every embed action is now an event** — Installing or deleting an integration pack, running processes, saving connections, resolving OAuth, editing maps, saving schedules, generating an AI transformation, and agent session/message activity all emit a typed event on the existing event bus (`onEvent` / `BoomiEvents.on` / `boomi:event`). This lets a **non-React, vanilla-JS host** (an Angular wrapper calling `BoomiPlugin` / `RenderComponent` / `DestroyPlugin` directly, for example) build an audit trail without any EmbedKit hooks.
  - ✅ **Credential-safe payloads** — Connection/environment-extension events report which field *keys* changed, never the values — those fields commonly carry connector credentials. Map events report counts and names, not full mapping data.
  - ✅ **`outcome` on the envelope** — Every event now carries `outcome: 'success' | 'error'` (currently always `'success'`; reserved for a future failure-emission pass).
  - ✅ **Documentation** — [Events & Callbacks](./ConfigurationReference.md#10-events--callbacks) now documents every event type, when it fires, and its payload shape; [Getting Started](./GettingStarted.md#audit-logging-from-vanilla-js) adds a vanilla-JS audit-logging walkthrough.
  - ℹ️ Integration-management events (`integration.*`, `connection.*`, `map.*`, `schedules.*`, `ai.*`) require the **Integration method** (npm) — the CDN embed only mounts Agent components, so only `feedback` and `agent.*` events fire there.

</details>

---

<details open>
  <summary><strong>v1.5.1</strong> — Single-install integration pack connections & maps, response feedback & standardized event callbacks</summary>

  **Highlights**
  - ✅ **Edit Connections & Edit Map(s) for single-install packs** — The integration actions menu now offers **Edit Connections** and **Edit Map(s)** for single-install integration packs. Previously these actions were only available for multi-install packs.
  - ✅ **Single-install extension updates fixed** — Saving connection extensions on a single-install pack no longer fails with a platform error (`Failed to extract process version …`). Map extension summaries for single-install packs are now queried by environment — single-install packs have no extension group — and matched to the pack's processes, so the post-save dynamic browse and map editing work for both installation types.
  - ✅ **Response feedback (thumbs up / down / comment)** — Agent responses now show configurable feedback controls. Ratings and comments are delivered to **your application** together with the user's prompt and the agent's response — EmbedKit never sends feedback over the network itself, so there is no endpoint to secure. Icons, labels, comment box text, and visibility are configurable per agent (`agents.<id>.feedback`), and styling is fully themeable via new `--boomi-agent-feedback-*` design tokens.
  - ✅ **Standardized event system** — New app-level callback pattern for all EmbedKit events (feedback was the first; see "Unreleased" above for the full event set added since). Every event is `{ type, timestamp, source, data }`. Subscribe with `BoomiPlugin({ onEvent })` (also `window.BoomiEmbed.onEvent` for CDN embeds), `BoomiEvents.on('feedback' | '*', handler)` from the package root, or the `boomi:event` DOM CustomEvent on `window` for plain-JS pages. Subscriber errors are isolated and never break the embed UI.
  - ✅ **Zero-config enablement** — The feedback bar appears automatically when a programmatic subscriber is registered; `feedback.enabled` force-shows (for DOM-only listeners) or force-hides it.
  - ✅ **Dependency** — Updated `@boomi/embedkit-sdk` to **1.3.1** (single-install support in map extension summary queries).
  - ✅ **Documentation** — New [Events & Callbacks](./ConfigurationReference.md#10-events--callbacks) section in the Configuration Reference covers the envelope, all three subscription methods, and the feedback event shape; the Agent Configuration section documents the `feedback` config block and CSS tokens.

  > **Note (2026-08-19):** the response-feedback and event-system work above was
  > originally published under a planned `v1.5.0` that was never tagged or
  > released to npm — it shipped as part of this v1.5.1. If you're looking for
  > `v1.5.0` in git history or on npm, it doesn't exist; everything described
  > above is live starting at v1.5.1.

</details>

---

<details>
  <summary><strong>v1.4.19</strong> — Boomi Agent Studio transformation provider</summary>

  **Highlights**
  - ✅ **Agent Studio as an AI transformation provider** — The Transformation Editor's AI generation can now run against one of your own **Boomi Agent Studio** agents instead of OpenAI. Select it per tenant with `ai.model: 'boomi-agent-studio'` and `boomiAgentId`; the call authenticates with the tenant's existing Boomi platform token — no OpenAI key required. `sessionType: 'single'` (one-shot) is supported today.
  - ✅ **Same output, same guardrails** — The agent returns OpenAI-style structured JSON, which the server validates and runs through the identical guardrails and output shape as the OpenAI path, so the editor behaves the same. A prose refusal surfaces as a clean 422.
  - ✅ **Documentation** — The [Transformation Editor](./TransformationEditor.md) guide now documents provider selection, the `boomiAgentId`/`sessionType` config with a working example, the structured-mode agent requirements, and troubleshooting.
  - ✅ **Dependency** — Updated `@boomi/embedkit-sdk` to **1.2.23** (adds the Agent Studio `AiConfig` fields).

</details>

---

<details>
  <summary><strong>v1.4.18</strong> — Bug Fixes: Editing Keys, Execution History Search & Delete Modal</summary>

  **Highlights**
  - ✅ **Shadow DOM editing keys** — Backspace/Delete and other editing keystrokes typed into embedded inputs are no longer swallowed by host-page key handlers. Composed keydown events targeting an editable element now stop at the shadow boundary, and the shadow root is attached with `delegatesFocus`.
  - ✅ **Execution history search now filters** — The search box on the integration execution history filters the fetched records **client-side** and matches across the **message, status, and execution time** columns. Full or partial execution times work (e.g. `2026-07-07`, `2026-07`, `14:30`, `23:59:59`). Pagination is applied to the filtered results, and a fetch loop that caused repeated requests was fixed.
  - ✅ **Delete transformation modal** — Clicking **Cancel** on the "delete transformation" confirmation in the mapping editor now closes the modal (previously it could not be dismissed).
  - ✅ **Documentation** — The [Configuration Reference](./ConfigurationReference.md) now documents **connection form validation** via `boomi.config.js`, including an example for a field that must be numeric and exactly 10 characters.
  - ✅ **Dependency** — Updated `@boomi/embedkit-sdk` to **1.2.22**.

</details>

---

<details>
  <summary><strong>v1.4.15</strong> — Chat Composer Backdrop & Wider Config Modal</summary>

  **Highlights**
  - ✅ **Chat composer backdrop** — The chat input now sits on a dedicated backdrop panel so the conversation no longer bleeds under the input as it scrolls. By default it renders as a soft transparent→solid fade with no divider line, giving the chat a cleaner, more standard look.
  - ✅ **Fully themeable** — The backdrop is driven by four new CSS design tokens that follow the existing theming system. They cascade with light, dark, `boomi`, and any custom theme, and can be overridden globally (`cssVars`) or per-theme (`cssVarsByTheme`).
  - ✅ **Admin Console support** — The new tokens are available in the theme builder's CSS Variable Overrides dropdown, so they can be configured per project without code.
  - ✅ **Wider configuration modal** — The Add/Edit Project modals in the Admin Console are now wider to comfortably fit the CSS variable editor and longer token names.
  - ✅ **Documentation** — The [Configuration Reference](./ConfigurationReference.md) and [CDN Configuration Guide](./CDNConfiguration.md) now document the composer backdrop tokens with usage examples and a complete working sample.

  **Configuration**

  The backdrop is configured with four CSS variables (defaults shown):

  ```js
  cssVars: {
    // Default look — a soft transparent→solid fade with no divider line.
    '--boomi-agent-composer-backdrop-bg': 'var(--boomi-agent-pane-bg)',
    '--boomi-agent-composer-backdrop-fade': '2.5rem',  // fade height; 0px = hard solid panel
    '--boomi-agent-composer-backdrop-line-width': '0',  // >0 to show a divider line
    '--boomi-agent-composer-backdrop-line-color': 'var(--boomi-agent-chat-border)',
  }
  ```

  | Token | Default | Purpose |
  |-------|---------|---------|
  | `--boomi-agent-composer-backdrop-bg` | `var(--boomi-agent-pane-bg)` | Solid color the panel resolves to |
  | `--boomi-agent-composer-backdrop-fade` | `2.5rem` | Transparent→solid fade height (`0px` = solid panel) |
  | `--boomi-agent-composer-backdrop-line-width` | `0` | Divider line thickness (`0` = no line) |
  | `--boomi-agent-composer-backdrop-line-color` | `var(--boomi-agent-chat-border)` | Divider line color |

  To get a solid panel with a thin divider line instead, set
  `--boomi-agent-composer-backdrop-fade: 0px` and
  `--boomi-agent-composer-backdrop-line-width: 1px`.

</details>

---

<details>
  <summary><strong>v1.4.10</strong> — Expandable Modal & Collapsible Sidebar</summary>

  **Highlights**
  - ✅ **Expandable modal** — Agents configured with `expandable: true` now show a maximize/minimize button in the modal header. Clicking it stretches the modal to fill the screen, giving users more space when working with complex responses.
  - ✅ **Collapsible sidebar** — When `expandable: true` and the sidebar is enabled, a collapse toggle appears in the sidebar header. Collapsing the sidebar hides the chat history rail and expands the main chat area. A single-icon strip allows the user to re-expand it at any time.
  - ✅ **Configuration Reference** — A new [Configuration Reference](./ConfigurationReference.md) document is now available covering every configuration option in detail: initialization, agent config, component config, form config, CDN config, and all CSS design tokens.

  **Bug Fixes**
  - Fixed an issue where agent responses containing HTML were rendered as raw text in the chat UI. Agent Studio agents that prepend plain text before an HTML block (e.g. a summary sentence followed by a `<div>`) now correctly render the full response as HTML.

  **Configuration**

  Set `expandable: true` at the root of any agent entry in `boomi.config.js`:

  ```js
  agents: {
    'my-agent-id': {
      expandable: true,   // enables both modal expand and sidebar collapse
      ui: {
        mode: 'modal',
        sidebar: { show: true },
        // ...
      },
    },
  }
  ```

  | Behavior | Applies When |
  |----------|-------------|
  | Modal expand/collapse button | `expandable: true` and `ui.mode: 'modal'` |
  | Sidebar collapse/expand toggle | `expandable: true` and `ui.sidebar.show: true` |

</details>

---

<details>
  <summary><strong>v1.4.8</strong> — HTML Content Rendering & Stability</summary>

  **Highlights**
  - ✅ Agent Studio agents that return raw HTML responses now render correctly in the chat UI. Previously, HTML content was escaped and displayed as plain text.
  - ✅ Improved robustness of SSE message handling for streaming agent responses.
  - ✅ General stability improvements and dependency updates.

  **Bug Fixes**
  - Fixed an issue where Agent Studio agents returning HTML strings via the SSE stream were not rendered as HTML in the `MessageBlock` component.

</details>

---

<details>
  <summary><strong>v1.3.24</strong> — CDN Package & jsDelivr Distribution</summary>

  **Highlights**
  - ✅ The `@boomi/embedkit-cdn` package is now published to npm and available via public CDN providers.
  - ✅ CDN assets can be referenced directly from [jsDelivr](https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/) or [unpkg](https://unpkg.com/@boomi/embedkit-cdn/).
  - ✅ The Admin Console token dialog now displays the correct jsDelivr CDN URLs in the embed snippet.
  - ✅ CDN documentation updated to reference the npm package and public CDN URLs.

  **Migration Note**
  - If you were previously referencing `cdn.boomi.space` URLs directly, update your embed snippet to use the jsDelivr or unpkg URLs. The old CDN host is deprecated.

  ```html
  <!-- Updated CDN references -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.css" />
  <script src="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.umd.cjs" async></script>
  ```

</details>

---

<details>
  <summary><strong>v1.3.0</strong> — Boomi Agents (Public Embed & Authenticated)</summary>

  > [!IMPORTANT]
  > This release introduces Boomi Agents as a first-class EmbedKit component type. Both the authenticated plugin flow (`@boomi/embedkit` npm package) and the public CDN drop-in (`@boomi/embedkit-cdn`) support agents.

  **Highlights**
  - ✅ **Agent components** — Embed Boomi Agents directly into your application as a chat interface.
  - ✅ **Public embed (CDN)** — Drop-in script for embedding agents on any website without a build pipeline. Requires only `window.BoomiEmbed` config and a public token from the Admin Console.
  - ✅ **Public session endpoint** — The EmbedKit Server exposes `POST /api/v1/embed/session` to validate public tokens and return scoped access credentials.
  - ✅ **Multi-agent embed types** — Support for `single`, `tiles`, and `list` embed layouts to surface one or multiple agents on a page.
  - ✅ **EmbedKit Admin Console** — New admin interface at [admin.boomi.space](https://admin.boomi.space) for managing CORS origins, agents, projects, and public tokens.
  - ✅ **Transport types** — Agents can be configured with `boomi-direct` (direct Boomi Platform routing) or `boomi-proxy` (EmbedKit proxy routing).
  - ✅ **Welcome screen & prompts** — Configurable welcome screen with title, subtitle, and pre-built prompt suggestions.
  - ✅ **Session modes** — `mount` (fresh session per page load) and `multi` (persistent chat history with sidebar).
  - ✅ **File attachments** — Optional file upload support with configurable extensions, file count, and size limits.
  - ✅ **Launcher customization** — Floating pill or circle launcher with configurable position, label, icon, and offset.
  - ✅ **Custom CSS variables** — Per-theme CSS variable overrides for full visual customization of the agent chat window.
  - ⚠️ File attachments are **not supported** with the `boomi-direct` transport in this release.

</details>

---

<details>
  <summary><strong>v1.0.0</strong> — Initial Release</summary>

  > [!TIP]
  > If you rely on OAuth2 for connected systems within Boomi, plan for an upgrade path once OAuth2 support is added. Pin to this version only for evaluation purposes.

  **Highlights**
  - ✅ First public release of the Boomi EmbedKit plugin.
  - ✅ Support for embedding Boomi Integrations, Connections, Schedules, and Data Mapping components.
  - ✅ React, ES Module, and CommonJS environments supported.
  - ✅ Built-in themes: `light`, `dark`, `boomi` with full CSS variable theming system.
  - ✅ JWT authentication via HMAC nonce exchange with the EmbedKit Server.
  - ✅ Shadow DOM isolation to prevent style conflicts with the host page.
  - ⚠️ OAuth2 for connected systems within Boomi is **not supported** in this release.

</details>
