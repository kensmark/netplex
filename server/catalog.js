import { createHash } from 'node:crypto';
import { AppError, array, metadata, normalizeItem, plexJson } from './plex.js';
import { isMediaId } from '../public/media-id.js';

const hash = (id) => createHash('sha256').update(id).digest('hex').slice(0, 24);
export const validMediaId = isMediaId;
export function identityKeys(raw) {
  return [
    ...new Set(
      [raw.guid, ...array(raw.Guid).map((g) => g.id)]
        .filter((value) => typeof value === 'string')
        .map((value) => {
          const clean = value.split('?')[0];
          if (/^plex:\/\/(movie|show|episode|season)\/[a-zA-Z0-9_-]+$/.test(clean))
            return raw.type + '|' + clean;
          const external = clean.match(
            /^(?:com\.plexapp\.agents\.)?(imdb|tmdb|themoviedb|tvdb|thetvdb):\/\/(tt\d+|\d+)(?:\/(\d+)\/(\d+))?$/,
          );
          return external
            ? raw.type +
                '|' +
                external[1].replace('themoviedb', 'tmdb').replace('thetvdb', 'tvdb') +
                '://' +
                external[2] +
                (external[3] ? '/' + external[3] + '/' + external[4] : '')
            : null;
        })
        .filter(Boolean),
    ),
  ];
}
export function createCatalog({ config, save, resources, validateConnection }) {
  config.servers ||= config.connection ? [{ ...config.connection, enabled: true }] : [];
  config.serverPreferences ||= {};
  config.serverSelections ||= {};
  config.catalogBookmarks ||= {};
  let cached = null,
    loading = null,
    generation = 0,
    discovery = null,
    discoveredAt = 0,
    discoveryWarning = '';
  let records = new Map(),
    aliases = new Map();
  const health = new Map();
  const invalidate = () => {
    cached = null;
    loading = null;
    generation++;
  };
  const primary = () => config.connection?.machineId;
  const known = () => config.servers;
  const enabled = () => known().filter((s) => s.enabled !== false && s.url);
  const request = (server, path, options) => plexJson(server, config.clientId, path, options);
  const idFor = (server, id) =>
    server.machineId === primary() ? String(id) : 's-' + hash(server.machineId) + '-' + id;
  const scope = () =>
    config.account?.id
      ? 'account-' + config.account.id
      : 'manual-' +
        createHash('sha256')
          .update(config.connection?.token || '')
          .digest('hex')
          .slice(0, 16);
  const listKey = (server) =>
    (config.account?.id ||
      'manual-' + createHash('sha256').update(server.token).digest('hex').slice(0, 16)) +
    ':' +
    server.machineId;
  const source = (row) => ({
    id: idFor(row.server, row.raw.ratingKey),
    serverId: row.server.machineId,
    name: row.server.name,
    resolution: String(array(row.raw.Media)[0]?.videoResolution || ''),
    edition: String(row.raw.editionTitle || ''),
  });
  const preferred = (rows) =>
    [...rows].sort(
      (a, b) =>
        Number(b.raw.lastViewedAt || 0) - Number(a.raw.lastViewedAt || 0) ||
        Number(Number(b.raw.viewOffset) > 0) - Number(Number(a.raw.viewOffset) > 0) ||
        Number(b.server.machineId === primary()) - Number(a.server.machineId === primary()),
    )[0];
  function decorate(raw, server) {
    if (!/^\d{1,20}$/.test(String(raw.ratingKey || '')))
      throw new AppError(502, 'Plex sendte et ugyldigt medie-id.');
    const item = normalizeItem(raw);
    item.id = idFor(server, item.id);
    item.parentId = item.parentId ? idFor(server, item.parentId) : null;
    item.serverId = server.machineId;
    item.serverName = server.name;
    for (const field of ['thumb', 'art'])
      if (item[field]) item[field] += '&server=' + encodeURIComponent(server.machineId);
    item.sources = [source({ raw, server })];
    return item;
  }
  function merge(rows, register = true) {
    const groups = [],
      byKey = new Map();
    for (const row of rows) {
      row.keys = [...identityKeys(row.raw), ...(row.extraKeys || [])];
      const matches = [...new Set(row.keys.map((key) => byKey.get(key)).filter(Boolean))];
      const group = matches[0] || { rows: [], keys: new Set() };
      if (!matches.length) groups.push(group);
      for (const other of matches.slice(1)) {
        group.rows.push(...other.rows);
        for (const key of other.keys) {
          group.keys.add(key);
          byKey.set(key, group);
        }
        other.removed = true;
      }
      group.rows.push(row);
      for (const key of row.keys) {
        group.keys.add(key);
        byKey.set(key, group);
      }
    }
    return groups
      .filter((g) => !g.removed)
      .map((group) => {
        group.rows = [
          ...new Map(group.rows.map((row) => [idFor(row.server, row.raw.ratingKey), row])).values(),
        ].sort(
          (a, b) =>
            Number(b.server.machineId === primary()) - Number(a.server.machineId === primary()) ||
            a.server.machineId.localeCompare(b.server.machineId) ||
            String(a.raw.ratingKey).localeCompare(String(b.raw.ratingKey)),
        );
        const anchor = group.rows[0],
          chosen = preferred(group.rows),
          item = decorate(chosen.raw, chosen.server);
        item.id = idFor(anchor.server, anchor.raw.ratingKey);
        item.sources = group.rows.map(source);
        item.preferredSourceId = idFor(chosen.server, chosen.raw.ratingKey);
        item.genres = [
          ...new Set(
            group.rows.flatMap((row) =>
              array(row.raw.Genre)
                .map((g) => g.tag)
                .filter(Boolean),
            ),
          ),
        ];
        item.directors = [
          ...new Set(
            group.rows.flatMap((row) =>
              array(row.raw.Director)
                .map((g) => g.tag)
                .filter(Boolean),
            ),
          ),
        ];
        item.cast = [
          ...new Map(
            group.rows.flatMap((row) =>
              array(row.raw.Role)
                .filter((p) => p.tag)
                .map((p) => [p.tag, { name: p.tag, role: p.role || '' }]),
            ),
          ).values(),
        ];
        item.addedAt = Math.max(...group.rows.map((row) => Number(row.raw.addedAt) || 0));
        group.id = item.id;
        group.item = item;
        if (register) {
          records.set(group.id, group);
          for (const row of group.rows) aliases.set(idFor(row.server, row.raw.ratingKey), group.id);
        }
        return item;
      });
  }
  function isSaved(group) {
    const bookmarks = config.catalogBookmarks[scope()] || {};
    if ([...group.keys].some((key) => bookmarks[key] === false)) return false;
    if ([...group.keys].some((key) => bookmarks[key] === true)) return true;
    return group.rows.some((row) =>
      (config.lists[listKey(row.server)] || []).includes(String(row.raw.ratingKey)),
    );
  }
  function locate(id) {
    if (!validMediaId(id)) throw new AppError(400, 'Ugyldigt medie-id.');
    const match = String(id).match(/^s-([a-f0-9]{24})-(\d+)$/),
      server = known().find((s) =>
        match ? hash(s.machineId) === match[1] : s.machineId === primary(),
      );
    if (!server || server.enabled === false)
      throw new AppError(404, 'Serveren er ikke valgt i dine indstillinger.');
    if (!server.url) throw new AppError(502, 'Denne Plex-server kan ikke nås lige nu.');
    return { server, rawId: match ? match[2] : String(id) };
  }
  async function connectDevice(device, previous = {}) {
    const item = {
      ...previous,
      machineId: String(device.clientIdentifier),
      name: String(device.name || 'Plex-server').slice(0, 200),
      token: device.accessToken,
      owned: Boolean(device.owned),
      enabled: config.serverPreferences[device.clientIdentifier] !== false,
    };
    if (!item.enabled) return item;
    if (previous.url && previous.token === item.token && health.get(item.machineId) !== 'offline')
      return item;
    const candidates = array(device.connections)
      .filter((c) => /^https?:\/\//.test(c.uri))
      .sort(
        (a, b) =>
          Number(b.protocol === 'https') * 2 +
          Number(b.local) -
          (Number(a.protocol === 'https') * 2 + Number(a.local)),
      )
      .slice(0, 12);
    let selected;
    for (let i = 0; i < candidates.length && !selected; i += 3) {
      try {
        selected = await Promise.any(
          candidates.slice(i, i + 3).map(async (c) => {
            const result = await validateConnection(c.uri, item.token, item.name, 5000);
            if (result.machineId !== item.machineId) throw new Error('Wrong server identity');
            return result;
          }),
        );
      } catch {}
    }
    if (selected) {
      Object.assign(item, selected, { name: item.name });
      health.set(item.machineId, 'online');
    } else health.set(item.machineId, 'offline');
    return item;
  }
  async function sync(force = false) {
    if (!config.account) return;
    config.serverPreferences = config.serverSelections[scope()] || config.serverPreferences;
    config.serverSelections[scope()] = config.serverPreferences;
    if (discovery) return discovery;
    if (!force && Date.now() - discoveredAt < 90000) return;
    const account = config.account;
    discoveredAt = Date.now();
    const task = (async () => {
      try {
        const devices = await resources(),
          next = [];
        for (let start = 0; start < devices.length; start += 4)
          next.push(
            ...(await Promise.all(
              devices
                .slice(start, start + 4)
                .filter(
                  (d) => typeof d.clientIdentifier === 'string' && d.clientIdentifier.length <= 200,
                )
                .map((d) =>
                  connectDevice(
                    d,
                    known().find((s) => s.machineId === d.clientIdentifier),
                  ),
                ),
            )),
          );
        if (config.account !== account) return;
        // An opt-out made while discovery was in progress must win.
        for (const entry of next)
          entry.enabled = config.serverPreferences[entry.machineId] !== false;
        const before = JSON.stringify(config.servers);
        config.servers = next;
        if (!config.connection) {
          const first = next.find((s) => s.url);
          if (first) config.connection = { ...first };
        } else {
          const current = next.find((s) => s.machineId === primary());
          if (current?.url) config.connection = { ...current };
        }
        discoveryWarning = '';
        if (force || before !== JSON.stringify(next)) invalidate();
        if (before !== JSON.stringify(next)) await save();
      } catch {
        if (config.account === account)
          discoveryWarning =
            'Plex kunne ikke opdatere serverlisten. Kendte servere bruges indtil videre.';
      }
    })();
    discovery = task;
    try {
      await task;
    } finally {
      if (discovery === task) discovery = null;
    }
  }
  async function getLibrary() {
    await sync();
    if (!known().length)
      throw new AppError(409, 'Forbind en Plex-server for at åbne dit bibliotek.');
    if (cached && Date.now() - cached.time < 90000) return cached;
    if (loading) return loading;
    const currentGeneration = generation,
      servers = enabled().map((s) => ({ ...s }));
    const task = (async () => {
      const outcomes = await Promise.allSettled(
        servers.map(async (server) => {
          const sections = array(
              (await request(server, '/library/sections')).MediaContainer?.Directory,
            ).filter((s) => ['movie', 'show'].includes(s.type)),
            rows = [];
          for (const section of sections) {
            if (!/^\d{1,20}$/.test(String(section.key)))
              throw new AppError(502, 'Plex returnerede et ugyldigt bibliotek.');
            let start = 0;
            for (;;) {
              const result = await request(server, '/library/sections/' + section.key + '/all', {
                  query: {
                    'X-Plex-Container-Start': start,
                    'X-Plex-Container-Size': 200,
                    sort: 'addedAt:desc',
                    includeGuids: 1,
                  },
                }),
                page = metadata(result);
              for (const raw of page)
                if (/^\d{1,20}$/.test(String(raw.ratingKey))) rows.push({ raw, server });
              start += page.length;
              const total = Number(result.MediaContainer?.totalSize);
              if (!page.length || (Number.isFinite(total) ? start >= total : page.length < 200))
                break;
              if (Number(result.MediaContainer?.offset || 0) !== start - page.length && start > 200)
                throw new AppError(502, 'Plex kunne ikke indlæse næste side af biblioteket.');
            }
          }
          health.set(server.machineId, 'online');
          return {
            rows,
            sections: sections.map((s) => ({
              id: String(s.key),
              title: s.title,
              type: s.type,
              serverId: server.machineId,
              serverName: server.name,
            })),
          };
        }),
      );
      if (generation !== currentGeneration) {
        if (loading === task) loading = null;
        return getLibrary();
      }
      const rows = [],
        sections = [],
        warnings = [];
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') {
          rows.push(...outcome.value.rows);
          sections.push(...outcome.value.sections);
        } else {
          health.set(servers[index].machineId, 'offline');
          warnings.push({
            id: servers[index].machineId,
            name: servers[index].name,
            message: 'Serveren kunne ikke indlæses.',
          });
        }
      });
      for (const server of known().filter((s) => s.enabled !== false && !s.url))
        warnings.push({
          id: server.machineId,
          name: server.name,
          message: 'Serveren kan ikke nås.',
        });
      records = new Map();
      aliases = new Map();
      const items = merge(rows);
      const bookmarks = config.catalogBookmarks[scope()] || {};
      let migrated = false;
      for (const group of records.values())
        if (isSaved(group))
          for (const key of group.keys)
            if (bookmarks[key] === undefined) {
              bookmarks[key] = true;
              migrated = true;
            }
      if (migrated) {
        config.catalogBookmarks[scope()] = bookmarks;
        await save();
      }
      if (generation !== currentGeneration) {
        if (loading === task) loading = null;
        return getLibrary();
      }
      cached = { items, sections, warnings, time: Date.now() };
      return cached;
    })();
    loading = task;
    try {
      return await task;
    } finally {
      if (loading === task) loading = null;
    }
  }
  async function continuing() {
    const library = await getLibrary(),
      rows = [],
      currentGeneration = generation;
    await Promise.all(
      enabled().map(async (server) => {
        try {
          const data = await request(server, '/hubs/continueWatching', {
              query: { count: 60, includeGuids: 1 },
            }),
            entries = metadata(data).length
              ? metadata(data)
              : array(data.MediaContainer?.Hub).flatMap((h) => array(h.Metadata));
          for (const raw of entries) rows.push({ raw, server });
        } catch {
          for (const group of records.values())
            for (const row of group.rows)
              if (
                row.server.machineId === server.machineId &&
                Number(row.raw.viewOffset) > 0 &&
                !Number(row.raw.viewCount)
              )
                rows.push(row);
        }
      }),
    );
    if (generation !== currentGeneration) return continuing();
    for (const row of rows) {
      const group = records.get(aliases.get(idFor(row.server, row.raw.ratingKey)));
      const original = group?.rows.find(
        (r) =>
          r.server.machineId === row.server.machineId &&
          String(r.raw.ratingKey) === String(row.raw.ratingKey),
      );
      if (original)
        for (const key of ['viewOffset', 'viewCount', 'lastViewedAt'])
          if (row.raw[key] !== undefined) original.raw[key] = row.raw[key];
    }
    const items = merge(rows, false);
    return items.map((item) => {
      const canonical = item.sources.map((s) => aliases.get(s.id)).find(Boolean);
      if (canonical) {
        const group = records.get(canonical);
        return { ...item, id: canonical, sources: group.item.sources };
      }
      return item;
    });
  }
  async function detail(id, sourceId) {
    const account = config.account;
    await getLibrary();
    const currentGeneration = generation,
      group = records.get(aliases.get(String(id)) || String(id));
    let rows = group?.rows;
    if (!rows) {
      const { server, rawId } = locate(id);
      rows = [{ server, raw: { ratingKey: rawId } }];
    }
    const desired = sourceId
      ? rows.find((row) => idFor(row.server, row.raw.ratingKey) === sourceId)
      : preferred(rows);
    if (!desired) throw new AppError(400, 'Denne kopi tilhører ikke den valgte titel.');
    const candidates = sourceId ? [desired] : [desired, ...rows.filter((r) => r !== desired)];
    let selected, raw, lastError;
    for (const row of candidates) {
      try {
        locate(idFor(row.server, row.raw.ratingKey));
        raw = metadata(
          await request(row.server, '/library/metadata/' + row.raw.ratingKey, {
            query: { includeGuids: 1 },
          }),
        )[0];
        if (!raw) throw new AppError(404, 'Titlen findes ikke længere på serveren.');
        selected = row;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!selected) throw lastError || new AppError(404, 'Titlen findes ikke.');
    if (config.account !== account)
      throw new AppError(409, 'Plex-brugeren er ændret. Åbn titlen igen.');
    if (generation !== currentGeneration)
      return detail(idFor(selected.server, raw.ratingKey), sourceId);
    const item = decorate(raw, selected.server);
    item.id = group?.id || idFor(selected.server, raw.ratingKey);
    item.sources = rows.map(source);
    item.preferredSourceId = idFor(selected.server, raw.ratingKey);
    return {
      item,
      raw,
      server: selected.server,
      group: group || {
        rows: [{ raw, server: selected.server }],
        keys: new Set(identityKeys(raw)),
        id: item.id,
        item,
      },
      sourceId: item.preferredSourceId,
    };
  }
  async function children(id, sourceId) {
    const parent = await detail(id, sourceId),
      rows = [];
    const candidates = parent.group.rows,
      wanted = sourceId ? parent.server.machineId : null;
    await Promise.all(
      candidates.map(async (row) => {
        try {
          const values = metadata(
            await request(row.server, '/library/metadata/' + row.raw.ratingKey + '/children', {
              query: { includeGuids: 1 },
            }),
          );
          for (const raw of values)
            rows.push({
              raw,
              server: row.server,
              ...(['season', 'episode'].includes(raw.type) && Number.isInteger(Number(raw.index))
                ? {
                    extraKeys: [...parent.group.keys].map(
                      (key) => raw.type + '|' + key + '|' + raw.index,
                    ),
                  }
                : {}),
            });
        } catch (error) {
          if (candidates.length === 1) throw error;
        }
      }),
    );
    const items = merge(rows).sort(
      (a, b) => a.season - b.season || a.episode - b.episode || a.title.localeCompare(b.title),
    );
    if (!wanted) return items;
    return items
      .filter((item) => item.sources.some((s) => s.serverId === wanted))
      .map((item) => {
        const row = records.get(item.id).rows.find((r) => r.server.machineId === wanted);
        return {
          ...decorate(row.raw, row.server),
          id: item.id,
          sources: item.sources,
          preferredSourceId: idFor(row.server, row.raw.ratingKey),
        };
      });
  }
  return {
    known,
    enabled,
    sync,
    invalidate,
    decorate,
    locate,
    idFor,
    getLibrary,
    continuing,
    detail,
    request,
    children,
    connected: () => known().length > 0,
    summary: () =>
      known().map((s) => ({
        id: s.machineId,
        name: s.name,
        owned: Boolean(s.owned),
        enabled: s.enabled !== false,
        available: s.enabled === false ? Boolean(s.url) : health.get(s.machineId) === 'online',
        status: s.enabled === false ? 'disabled' : health.get(s.machineId) || 'unknown',
      })),
    warning: () => discoveryWarning,
    savedIds: () => [...records.values()].filter(isSaved).map((g) => g.id),
    isSaved,
    async setSaved(group, value) {
      for (const row of group.rows) {
        const ids = new Set(config.lists[listKey(row.server)] || []);
        value ? ids.add(String(row.raw.ratingKey)) : ids.delete(String(row.raw.ratingKey));
        config.lists[listKey(row.server)] = [...ids];
      }
      const bookmarks = config.catalogBookmarks[scope()] || {};
      for (const key of group.keys) bookmarks[key] = value;
      config.catalogBookmarks[scope()] = bookmarks;
      await save();
    },
    async toggle(id, value) {
      await sync();
      const entry = known().find((s) => s.machineId === id);
      if (!entry) throw new AppError(404, 'Serveren findes ikke på din konto.');
      config.serverPreferences[id] = value;
      entry.enabled = value;
      if (value && config.account) {
        discoveredAt = 0;
        await sync(true);
      }
      invalidate();
      await save();
    },
    manual(server) {
      config.servers = [{ ...server, enabled: true }];
      config.serverPreferences = {};
      config.connection = server;
      discoveredAt = 0;
      invalidate();
    },
    reset() {
      config.servers = [];
      config.serverPreferences = {};
      discoveredAt = 0;
      records = new Map();
      aliases = new Map();
      invalidate();
    },
  };
}
