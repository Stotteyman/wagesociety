// public/js/admin-discord.js — Client-side logic for /admin/discord management page.
// Communicates with /api/admin/discord/* endpoints.

(function() {
  'use strict';

  var API = '/api/admin/discord';
  var state = { server: null, settings: null, tierMap: null, logs: [], logsPage: 1 };

  // ── Discord permission bit flags ─────────────────────────────────────
  var PF = {
    VIEW_CHANNEL:           1024,
    SEND_MESSAGES:          2048,
    SEND_TTS_MESSAGES:      4096,
    MANAGE_MESSAGES:        8192,
    EMBED_LINKS:            16384,
    ATTACH_FILES:           32768,
    READ_MESSAGE_HISTORY:  65536,
    MENTION_EVERYONE:      131072,
    USE_EXTERNAL_EMOJIS:   262144,
    CONNECT:              2097152,
    SPEAK:                 65536,
    STREAM:                262144,
    MANAGE_CHANNELS:     16777216,
    CREATE_INSTANT_INVITE:   1,
    ADD_REACTIONS:          64,
  };

  // ── Utilities ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.style.display = ''; }
  function hide(el) { if (el) el.style.display = 'none'; }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  function setHtml(id, html) { var el = $(id); if (el) el.innerHTML = html; }

  function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function(r) { return r.json(); });
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    var now = new Date();
    var sec = Math.floor((now - d) / 1000);
    if (sec < 60) return sec + 's ago';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return d.toLocaleDateString();
  }

  function showToast(msg, type) {
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'success');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  // ── Tab Navigation ─────────────────────────────────────────────────────
  window.switchTab = function(tabId) {
    document.querySelectorAll('.dc-tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.dc-tab-panel').forEach(function(p) {
      p.classList.toggle('active', p.id === 'tab-' + tabId);
    });
    if (tabId === 'settings' && !state.settings) loadBotSettings();
    if (tabId === 'servers') loadServers();
    if (tabId === 'channels') loadChannelsTab();
    if (tabId === 'roles-settings') loadRolesSettingsTab();
    if (tabId === 'logs' && state.logs.length === 0) loadLogs();
  };

  // ── Tab 1: Main Server ───────────────────────────────────────────────
  function loadServerInfo() {
    setText('server-status', 'Loading...');
    api('GET', '/server').then(function(data) {
      state.server = data;
      if (!data.configured) {
        setText('server-status', 'Not Configured');
        $('server-status').className = 'status-value warn';
        return;
      }
      if (!data.connected) {
        setText('server-status', 'Disconnected');
        $('server-status').className = 'status-value error';
        return;
      }
      setText('server-status', 'Connected ✓');
      $('server-status').className = 'status-value ok';
      setText('server-name', data.guild.name || '—');
      setText('server-members', data.guild.memberCount != null ? data.guild.memberCount.toLocaleString() : '—');
      setText('server-role-count', data.roles ? data.roles.length : '—');
      setText('server-linked', data.linkedCount || 0);
      var vlNames = ['None', 'Low', 'Medium', 'High', 'Highest'];
      setText('server-vl', vlNames[data.guild.verificationLevel] || '—');
      if (data.guild.icon) {
        $('server-icon').src = data.guild.icon;
        show($('server-icon'));
      }
      renderRolesTable(data.roles || []);
      renderChannelsList(data.channels || []);
      renderRoleCleanup(data.roles || []);
    }).catch(function() {
      setText('server-status', 'Error');
      $('server-status').className = 'status-value error';
    });
  }

  function renderRolesTable(roles) {
    var html = '';
    roles.forEach(function(r) {
      if (r.name === '@everyone') return;
      var colorSwatch = '<span class="role-swatch" style="background:' + (r.color ? r.colorHex : '#99aab5') + '"></span>';
      html += '<tr data-role-id="' + r.id + '">' +
        '<td>' + colorSwatch + ' <span class="role-name">' + escHtml(r.name) + '</span>' +
        (r.managed ? ' <span class="badge-managed">BOT</span>' : '') + '</td>' +
        '<td><input type="color" value="' + r.colorHex + '" class="role-color-input" data-id="' + r.id + '" ' + (r.managed ? 'disabled' : '') + '></td>' +
        '<td class="text-center">' + (r.hoist ? '✓' : '—') + '</td>' +
        '<td class="text-center">' + (r.mentionable ? '✓' : '—') + '</td>' +
        '<td>' + (r.managed ? '<span style="color:var(--muted);font-size:0.75rem;">Managed</span>' :
          '<button class="btn btn-sm btn-ghost" onclick="syncRole(\u0027' + r.id + '\u0027)">Sync</button>') + '</td>' +
        '</tr>';
    });
    setHtml('roles-tbody', html || '<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:2rem;">No roles found</td></tr>');
  }

  window.syncRole = function(roleId) {
    var row = document.querySelector('tr[data-role-id="' + roleId + '"]');
    if (!row) return;
    var colorInput = row.querySelector('.role-color-input');
    var color = colorInput ? parseInt(colorInput.value.replace('#', ''), 16) : undefined;
    api('PUT', '/roles/' + roleId, { color: color }).then(function(data) {
      if (data.ok) showToast('Role synced to Discord');
      else showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
    });
  };

  function renderChannelsList(channels) {
    var categories = {};
    var uncategorized = [];
    channels.forEach(function(c) {
      if (c.type === 4) categories[c.id] = { name: c.name, channels: [] };
    });
    channels.forEach(function(c) {
      if (c.type === 4) return;
      if (c.parentId && categories[c.parentId]) categories[c.parentId].channels.push(c);
      else uncategorized.push(c);
    });
    var html = '';
    var typeLabels = { 0: '💬', 2: '🔊', 4: '📁', 5: '📢', 15: '💬' };
    Object.values(categories).forEach(function(cat) {
      html += '<div class="channel-category">' +
        '<div class="channel-cat-name">📁 ' + escHtml(cat.name).toUpperCase() + '</div>';
      cat.channels.forEach(function(ch) {
        html += '<div class="channel-item">' + (typeLabels[ch.type] || '💬') + ' ' + escHtml(ch.name) + '</div>';
      });
      html += '</div>';
    });
    if (uncategorized.length) {
      html += '<div class="channel-category"><div class="channel-cat-name">UNCATEGORIZED</div>';
      uncategorized.forEach(function(ch) {
        html += '<div class="channel-item">' + (typeLabels[ch.type] || '💬') + ' ' + escHtml(ch.name) + '</div>';
      });
      html += '</div>';
    }
    setHtml('channels-list', html || '<div style="color:var(--muted);padding:1rem;">No channels found</div>');
  }

  function renderRoleCleanup(roles) {
    var flagged = [
      { name: 'carl-bot', reason: 'Third-party bot role — keep only if carl-bot is still in server' },
      { name: 'MEE6', reason: 'Third-party bot role — keep only if MEE6 is still in server' },
      { name: '.', reason: 'Appears to be a placeholder/empty role' },
      { name: 'Chill', reason: 'Unclear purpose — may be a general community role' },
      { name: '$', reason: 'Unclear purpose' },
    ];
    var roleMap = {};
    roles.forEach(function(r) { roleMap[r.name] = r; });
    var html = '';
    var found = false;
    flagged.forEach(function(f) {
      var role = roleMap[f.name];
      if (!role) return;
      found = true;
      html += '<div class="cleanup-row">' +
        '<div class="cleanup-info">' +
        '<span class="cleanup-name">' + escHtml(f.name) + '</span>' +
        '<span class="cleanup-reason">' + escHtml(f.reason) + '</span>' +
        '</div>' +
        '<div class="cleanup-actions">' +
        '<button class="btn btn-sm btn-ghost" onclick="keepRole(\u0027' + role.id + '\u0027, this)">Keep</button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteRole(\u0027' + role.id + '\u0027, \u0027' + escHtml(f.name) + '\u0027, this)">Delete</button>' +
        '</div></div>';
    });
    if (!found) html = '<div style="color:var(--muted);padding:1rem;text-align:center;">No flagged roles — all looks clean.</div>';
    setHtml('role-cleanup-list', html);
  }

  window.keepRole = function(roleId, btn) {
    btn.closest('.cleanup-row').style.opacity = '0.4';
    btn.closest('.cleanup-row').querySelector('.cleanup-name').style.textDecoration = 'line-through';
    showToast('Role kept');
  };

  window.deleteRole = function(roleId, roleName, btn) {
    if (!confirm('Delete role "' + roleName + '" from Discord? This cannot be undone.')) return;
    btn.disabled = true;
    api('DELETE', '/roles/' + roleId).then(function(data) {
      if (data.ok) {
        btn.closest('.cleanup-row').remove();
        showToast('Role deleted from Discord');
      } else {
        showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
        btn.disabled = false;
      }
    });
  };

  window.runChannelSetup = function() {
    var btn = $('channel-setup-btn');
    btn.disabled = true; btn.textContent = 'Creating channels...';
    api('POST', '/channels/setup').then(function(data) {
      btn.disabled = false; btn.textContent = 'Run Channel Setup';
      if (data.ok) {
        showToast('Created ' + data.created.length + ' channels, ' + data.skipped.length + ' already existed');
        loadServerInfo();
      } else {
        showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
      }
    }).catch(function() {
      btn.disabled = false; btn.textContent = 'Run Channel Setup';
      showToast('Request failed', 'error');
    });
  };

  window.recreateVerify = function() {
    var btn = $('verify-btn');
    btn.disabled = true; btn.textContent = 'Recreating...';
    api('POST', '/channels/verify').then(function(data) {
      btn.disabled = false; btn.textContent = 'Recreate #verify';
      if (data.ok) showToast('#verify channel recreated');
      else showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }).catch(function() { btn.disabled = false; btn.textContent = 'Recreate #verify'; });
  };

  // ── Tab 2: Bot Settings ───────────────────────────────────────────────
  function loadBotSettings() {
    api('GET', '/bot/status').then(function(data) {
      if (data.connected && data.bot) {
        setText('bot-username', data.bot.username || '—');
        setText('bot-id', data.bot.id || '—');
        setText('bot-conn-status', 'Connected');
        $('bot-conn-status').className = 'status-pill ok';
        if (data.bot.avatar) { $('bot-avatar').src = data.bot.avatar; show($('bot-avatar')); }
      } else {
        setText('bot-conn-status', 'Disconnected');
        $('bot-conn-status').className = 'status-pill error';
      }
      state.settings = data.settings || {};
      renderSettingsForm(state.settings);
    });
    api('GET', '/bot/tier-map').then(function(data) {
      state.tierMap = data.map || [];
      renderTierMap(state.tierMap);
    });
  }

  function renderSettingsForm(s) {
    setChecked('set-auto-assign', s.auto_assign_on_oauth === 'true' || s.auto_assign_on_oauth === true);
    setChecked('set-kick-unlinked', s.kick_unlinked === 'true' || s.kick_unlinked === true);
    setChecked('set-dm-role-change', s.dm_on_role_change === 'true' || s.dm_on_role_change === true);
    setChecked('set-welcome-enabled', s.welcome_message_enabled === 'true' || s.welcome_message_enabled === true);
    setChecked('set-lockdown', s.everyone_lockdown === 'true' || s.everyone_lockdown === true);
    setVal('set-sync-freq', s.role_sync_frequency || 'on_demand');
    setVal('set-welcome-text', s.welcome_message_text || '');
    setVal('set-verify-text', s.verify_embed_text || '');
    setVal('set-auto-role', s.auto_role_on_join || 'Member');
  }

  function setChecked(id, val) { var el = $(id); if (el) el.checked = val; }
  function setVal(id, val) { var el = $(id); if (el) el.value = val; }

  window.saveSettings = function() {
    var settings = {
      auto_assign_on_oauth: $('set-auto-assign').checked ? 'true' : 'false',
      kick_unlinked: $('set-kick-unlinked').checked ? 'true' : 'false',
      dm_on_role_change: $('set-dm-role-change').checked ? 'true' : 'false',
      welcome_message_enabled: $('set-welcome-enabled').checked ? 'true' : 'false',
      everyone_lockdown: $('set-lockdown').checked ? 'true' : 'false',
      role_sync_frequency: $('set-sync-freq').value,
      welcome_message_text: $('set-welcome-text').value,
      verify_embed_text: $('set-verify-text').value,
      auto_role_on_join: $('set-auto-role').value,
    };
    api('PUT', '/bot/settings', settings).then(function(data) {
      if (data.ok) { state.settings = data.settings; showToast('Settings saved'); }
      else showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    });
  };

  function renderTierMap(map) {
    var html = '';
    map.forEach(function(m) {
      html += '<tr>' +
        '<td><strong>' + escHtml(m.tier) + '</strong></td>' +
        '<td><input type="text" class="input-sm tier-role-input" data-tier="' + escHtml(m.tier) + '" value="' + escHtml(m.discord_role_name) + '"></td>' +
        '<td style="color:var(--muted);font-size:0.75rem;">' + (m.discord_role_id || '—') + '</td>' +
        '</tr>';
    });
    setHtml('tier-map-tbody', html || '<tr><td colspan="3" style="color:var(--muted);text-align:center;">No mappings found</td></tr>');
  }

  window.saveTierMap = function() {
    var inputs = document.querySelectorAll('.tier-role-input');
    var mappings = [];
    inputs.forEach(function(inp) { mappings.push({ tier: inp.dataset.tier, discord_role_name: inp.value }); });
    api('PUT', '/bot/tier-map', { mappings: mappings }).then(function(data) {
      if (data.ok) { state.tierMap = data.map; renderTierMap(data.map); showToast('Tier map saved'); }
      else showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    });
  };

  window.syncAllRoles = function() {
    var btn = $('sync-all-btn');
    btn.disabled = true; btn.textContent = 'Syncing...';
    setHtml('sync-log', '<div style="color:var(--muted);padding:0.5rem;">Starting sync...</div>');
    show($('sync-log'));
    api('POST', '/bot/sync-all').then(function(data) {
      btn.disabled = false; btn.textContent = 'Sync All Roles Now';
      var html = '<div style="margin-bottom:0.5rem;"><span style="color:#22c55e;font-weight:600;">' + data.synced + ' synced</span> · ' +
        '<span style="color:#ef4444;">' + data.failed + ' failed</span> · ' +
        '<span style="color:#eab308;">' + data.skipped + ' skipped</span></div>';
      (data.results || []).slice(0, 30).forEach(function(r) {
        var cls = r.synced ? 'ok' : 'fail';
        html += '<div class="log-entry"><span class="log-result ' + cls + '">' + (r.synced ? '✓' : '✗') + '</span> ' + escHtml(r.email || '?') + '</div>';
      });
      setHtml('sync-log', html);
    }).catch(function(err) {
      btn.disabled = false; btn.textContent = 'Sync All Roles Now';
      setHtml('sync-log', '<div style="color:#ef4444;">Error: ' + err.message + '</div>');
    });
  };

  // ── Tab 3: Other Servers ──────────────────────────────────────────────
  function loadServers() {
    api('GET', '/servers').then(function(data) {
      if (!data.servers || data.servers.length === 0) {
        setHtml('other-servers-list', '<div style="color:var(--muted);text-align:center;padding:3rem;">No additional servers connected.</div>');
        return;
      }
      var html = '';
      data.servers.forEach(function(s) {
        if (s.primary) return;
        html += '<div class="server-card">' +
          (s.icon ? '<img src="' + s.icon + '" class="server-icon-sm">' : '') +
          '<div><strong>' + escHtml(s.name) + '</strong><br><span style="color:var(--muted);font-size:0.8rem;">' + (s.memberCount || '?') + ' members</span></div>' +
          '</div>';
      });
      setHtml('other-servers-list', html || '<div style="color:var(--muted);text-align:center;padding:3rem;">No additional servers.</div>');
    });
  }

  // ── Tab 5: Logs ───────────────────────────────────────────────────────
  function loadLogs(page) {
    page = page || 1;
    state.logsPage = page;
    var event = $('log-filter-event') ? $('log-filter-event').value : '';
    api('GET', '/logs?page=' + page + '&limit=50' + (event ? '&event=' + event : '')).then(function(data) {
      state.logs = data.logs || [];
      var html = '';
      state.logs.forEach(function(l) {
        var details = '';
        if (l.details && typeof l.details === 'object') {
          details = Object.entries(l.details).map(function(e) { return e[0] + ': ' + JSON.stringify(e[1]); }).join(', ');
        }
        html += '<tr>' +
          '<td style="white-space:nowrap;">' + timeAgo(l.created_at) + '</td>' +
          '<td><span class="event-badge">' + escHtml(l.event) + '</span></td>' +
          '<td style="font-size:0.75rem;color:var(--muted);">' + (l.discord_user_id || '—') + '</td>' +
          '<td style="font-size:0.75rem;color:var(--muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;">' + escHtml(details) + '</td>' +
          '</tr>';
      });
      setHtml('logs-tbody', html || '<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:2rem;">No logs found</td></tr>');
      var pHtml = '';
      if (data.pages > 1) {
        for (var i = 1; i <= data.pages; i++) {
          pHtml += '<button class="btn btn-sm ' + (i === page ? 'btn-primary' : 'btn-ghost') + '" onclick="loadLogsPage(' + i + ')">' + i + '</button> ';
        }
      }
      setHtml('logs-pagination', pHtml);
    });
  }
  window.loadLogsPage = function(p) { loadLogs(p); };
  window.filterLogs = function() { loadLogs(1); };

  // ─══════════════════════════════════════════════════════════════════════
  // TAB 4: CHANNELS & PERMISSIONS
  // ─══════════════════════════════════════════════════════════════════════

  var cpChannels = [];
  var cpRoles = [];
  var cpSelectedChannelId = null;
  var cpCurrentOverwrites = []; // { id, type, allow, deny } — fetched fresh from API

  function loadChannelsTab() {
    if (cpChannels.length > 0) return;
    api('GET', '/server').then(function(data) {
      cpChannels = data.channels || [];
      cpRoles = data.roles || [];
      renderChannelTree();
    });
  }

  // Collapsible channel tree
  function renderChannelTree() {
    var catMap = {};
    var uncategorized = [];
    cpChannels.forEach(function(c) {
      if (c.type === 4) catMap[c.id] = { name: c.name, channels: [], type: 4, id: c.id, position: c.position };
    });
    cpChannels.forEach(function(c) {
      if (c.type === 4) return;
      if (c.parentId && catMap[c.parentId]) catMap[c.parentId].channels.push(c);
      else uncategorized.push(c);
    });

    var typeIcons = { 0: '💬', 2: '🔊', 4: '📁', 5: '📢', 15: '💬', 13: '📋' };
    var typeLabels = { 0: 'text', 2: 'voice', 13: 'stage' };

    var structureOrder = ['information', 'general', 'creators', 'wage', 'streams', 'staff', 'wage world'];
    var structureNames = {
      'information': 'INFORMATION', 'general': 'GENERAL', 'creators': 'CREATORS',
      'wage': 'W.A.G.E.', 'streams': 'STREAMS', 'staff': 'STAFF', 'wage world': 'WAGE WORLD'
    };

    var orderedCats = Object.values(catMap).sort(function(a, b) {
      var ai = structureOrder.indexOf(a.name.toLowerCase().replace(/[^a-z ]/g, ''));
      var bi = structureOrder.indexOf(b.name.toLowerCase().replace(/[^a-z ]/g, ''));
      if (ai === -1 && bi === -1) return a.position - b.position;
      return ai === -1 ? 1 : bi === -1 ? -1 : ai - bi;
    });

    var html = '';
    orderedCats.forEach(function(cat) {
      var displayName = structureNames[cat.name.toLowerCase()] || cat.name.toUpperCase();
      var catId = 'cat-' + cat.id;
      var channelsHtml = '';
      cat.channels.forEach(function(ch) {
        var icon = typeIcons[ch.type] || '💬';
        var selected = ch.id === cpSelectedChannelId ? ' style="background:rgba(255,102,0,0.15);border-radius:6px;"' : '';
        var voiceExtra = ch.type === 2 ? '<span style="font-size:0.65rem;color:var(--muted);margin-left:0.3rem;">🔊</span>' : '';
        channelsHtml += '' +
          '<div class="ch-row"' + selected + '>' +
            '<span class="ch-icon-btn" data-id="' + ch.id + '" data-name="' + escHtml(ch.name) + '" data-type="' + ch.type + '" data-cat="' + cat.id + '" onclick="openChannelPermissions(\u0027' + ch.id + '\u0027)">' +
              icon + ' <span class="ch-name">' + escHtml(ch.name) + '</span>' + voiceExtra +
            '</span>' +
            '<div class="ch-actions">' +
              '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();moveChannel(\u0027' + ch.id + '\u0027,\u0027up\u0027)" title="Move up" style="font-size:0.6rem;">↑</button>' +
              '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();moveChannel(\u0027' + ch.id + '\u0027,\u0027down\u0027)" title="Move down" style="font-size:0.6rem;">↓</button>' +
              '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openRenameChannel(\u0027' + ch.id + '\u0027,\u0027' + escHtml(ch.name) + '\u0027)" title="Rename">✏️</button>' +
              '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openDeleteChannel(\u0027' + ch.id + '\u0027,\u0027' + escHtml(ch.name) + '\u0027)" title="Delete">🗑️</button>' +
            '</div>' +
          '</div>';
      });

      html += '' +
        '<div class="ch-category">' +
          '<div class="ch-cat-header" onclick="toggleCategory(\u0027' + catId + '\u0027, this)">' +
            '<span class="ch-cat-icon" id="' + catId + '-icon">▸</span> 📁 <span class="ch-cat-name">' + escHtml(displayName) + '</span>' +
            '<span class="ch-cat-count">(' + cat.channels.length + ')</span>' +
          '</div>' +
          '<div style="padding-left:1rem;display:flex;align-items:center;gap:0.2rem;margin-bottom:0.2rem;">' +
            '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();moveCategory(\u0027' + cat.id + '\u0027,\u0027up\u0027)" title="Move up" style="font-size:0.6rem;">↑</button>' +
            '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();moveCategory(\u0027' + cat.id + '\u0027,\u0027down\u0027)" title="Move down" style="font-size:0.6rem;">↓</button>' +
            '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openRenameCategory(\u0027' + cat.id + '\u0027,\u0027' + escHtml(cat.name) + '\u0027)" title="Rename category">✏️</button>' +
            '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openDeleteCategory(\u0027' + cat.id + '\u0027,\u0027' + escHtml(cat.name) + '\u0027)" title="Delete category" style="color:#ef4444;">🗑️</button>' +
            '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openCreateChannelInCategory(\u0027' + cat.id + '\u0027)" title="New channel in this category">+ 💬</button>' +
          '</div>' +
          '<div class="ch-cat-children" id="' + catId + '">' + channelsHtml + '</div>' +
        '</div>';
    });

    if (uncategorized.length > 0) {
      html += '<div class="ch-category">' +
        '<div class="ch-cat-header" onclick="toggleCategory(\u0027cat-unc\u0027, this)">' +
          '<span class="ch-cat-icon" id="cat-unc-icon">▸</span> 📁 UNCATEGORIZED' +
        '</div>' +
        '<div class="ch-cat-children" id="cat-unc">';
      uncategorized.forEach(function(ch) {
        var icon = typeIcons[ch.type] || '💬';
        var selected = ch.id === cpSelectedChannelId ? ' style="background:rgba(255,102,0,0.15);border-radius:6px;"' : '';
        html += '' +
          '<div class="ch-row"' + selected + '>' +
            '<span class="ch-icon-btn" onclick="openChannelPermissions(\u0027' + ch.id + '\u0027)">' + icon + ' ' + escHtml(ch.name) + '</span>' +
            '<div class="ch-actions">' +
              '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openRenameChannel(\u0027' + ch.id + '\u0027,\u0027' + escHtml(ch.name) + '\u0027)">✏️</button>' +
              '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();openDeleteChannel(\u0027' + ch.id + '\u0027,\u0027' + escHtml(ch.name) + '\u0027)">🗑️</button>' +
            '</div>' +
          '</div>';
      });
      html += '</div></div>';
    }

    setHtml('cp-channel-tree', html || '<div style="color:var(--muted);padding:1rem;text-align:center;">No channels found</div>');
  }

  window.toggleCategory = function(catId, headerEl) {
    var children = $(catId);
    var icon = $(catId + '-icon');
    if (!children || !icon) return;
    if (children.style.display === 'none') {
      children.style.display = '';
      icon.textContent = '▾';
    } else {
      children.style.display = 'none';
      icon.textContent = '▸';
    }
  };

  // Open channel permissions panel
  window.openChannelPermissions = function(channelId) {
    cpSelectedChannelId = channelId;
    show($('cp-permission-panel'));
    show($('cp-empty-panel')); // keep both visible for layout
    $('cp-permission-panel').style.display = '';
    $('cp-empty-panel').style.display = 'none';

    api('GET', '/channels/' + channelId + '/permissions').then(function(data) {
      var chName = data.channelName || 'Channel';
      setText('cp-channel-name', chName);
      setText('cp-channel-desc', 'Manage who can access this channel. Changes save to Discord immediately.');
      cpCurrentOverwrites = (data.overwrites || []).map(function(o) {
        return { id: o.id, type: o.type, allow: o.allow, deny: o.deny };
      });
      renderFullPermissionTable(channelId, chName);
      renderChannelTree();
    }).catch(function() {
      showToast('Failed to load channel permissions', 'error');
    });
  };

  // Full 7-permission table for all roles
  function renderFullPermissionTable(channelId, channelName) {
    var isVoice = false;
    cpChannels.forEach(function(c) { if (c.id === channelId && c.type === 2) isVoice = true; });

    var cols = [
      { key: 'view',         label: 'View',         flag: PF.VIEW_CHANNEL,           hint: 'Can see channel' },
      { key: 'send',         label: 'Send',         flag: PF.SEND_MESSAGES,           hint: 'Can send messages' },
      { key: 'read_hist',   label: 'History',      flag: PF.READ_MESSAGE_HISTORY,   hint: 'Can read past messages' },
      { key: 'connect',      label: 'Connect',      flag: PF.CONNECT,                 hint: 'Can join voice channel', voiceOnly: true },
      { key: 'speak',        label: 'Speak',         flag: PF.SPEAK,                   hint: 'Can speak in voice', voiceOnly: true },
      { key: 'stream',       label: 'Stream',        flag: PF.STREAM,                  hint: 'Can stream in voice', voiceOnly: true },
      { key: 'manage_ch',   label: 'Manage',        flag: PF.MANAGE_CHANNELS,         hint: 'Admin override' },
    ];

    var thHtml = '<th style="text-align:left;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);padding:0.4rem 0.5rem;">Role</th>';
    cols.forEach(function(c) {
      if (c.voiceOnly && !isVoice) return;
      thHtml += '<th style="text-align:center;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);padding:0.4rem 0.25rem;" title="' + escHtml(c.hint) + '">' + c.label + '</th>';
    });

    var tbody = '';
    // @everyone first
    cpRoles.forEach(function(role) {
      if (role.name !== '@everyone') return;
      var ow = cpCurrentOverwrites.find(function(o) { return o.id === role.id; });
      var allow = ow ? ow.allow : 0;
      var deny = ow ? ow.deny : 0;
      var row = '<tr data-role-id="' + role.id + '"><td style="padding:0.4rem 0.5rem;font-weight:600;font-size:0.78rem;">@everyone <span style="font-size:0.65rem;color:var(--muted);font-weight:400;">(all members)</span></td>';
      cols.forEach(function(c) {
        if (c.voiceOnly && !isVoice) return;
        var granted = (allow & c.flag) !== 0;
        var revoked = (deny & c.flag) !== 0;
        var checked = granted && !revoked;
        var cls = revoked ? 'perm-denied' : granted ? 'perm-allowed' : '';
        row += '<td style="text-align:center;"><input type="checkbox" class="perm-cb" data-role="' + role.id + '" data-perm="' + c.key + '" data-flag="' + c.flag + '" ' + (checked ? 'checked' : '') + '></td>';
      });
      row += '</tr>';
      tbody += row;
    });

    // Other roles
    cpRoles.forEach(function(role) {
      if (role.name === '@everyone' || role.managed) return;
      var ow = cpCurrentOverwrites.find(function(o) { return o.id === role.id; });
      var allow = ow ? ow.allow : 0;
      var deny = ow ? ow.deny : 0;
      var colorSwatch = role.colorHex && role.colorHex !== '#000000'
        ? '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + role.colorHex + ';vertical-align:middle;margin-right:0.3rem;"></span>'
        : '';
      var row = '<tr data-role-id="' + role.id + '"><td style="padding:0.4rem 0.5rem;font-size:0.78rem;">' + colorSwatch + escHtml(role.name) + '</td>';
      cols.forEach(function(c) {
        if (c.voiceOnly && !isVoice) return;
        var granted = (allow & c.flag) !== 0;
        var revoked = (deny & c.flag) !== 0;
        var checked = granted && !revoked;
        row += '<td style="text-align:center;"><input type="checkbox" class="perm-cb" data-role="' + role.id + '" data-perm="' + c.key + '" data-flag="' + c.flag + '" ' + (checked ? 'checked' : '') + '></td>';
      });
      row += '</tr>';
      tbody += row;
    });

    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">' +
      '<thead><tr>' + thHtml + '</tr></thead>' +
      '<tbody id="perm-tbody">' + tbody + '</tbody></table>';

    setHtml('cp-permission-list', html);

    // "Apply to all in category" button
    var ch = cpChannels.find(function(c) { return c.id === channelId; });
    if (ch && ch.parentId) {
      var catName = (cpChannels.find(function(c) { return c.id === ch.parentId; }) || {}).name || 'Category';
      $('cp-apply-cat-btn').style.display = '';
      $('cp-apply-cat-btn').onclick = function() { applyToCategory(channelId, ch.parentId); };
    } else {
      $('cp-apply-cat-btn').style.display = 'none';
    }
  }

  window.saveChannelPermissions = function() {
    if (!cpSelectedChannelId) return;
    var btn = $('cp-save-btn');
    btn.disabled = true; btn.textContent = 'Saving...';

    var overwrites = [];
    var rows = document.querySelectorAll('#perm-tbody tr[data-role-id]');

    rows.forEach(function(row) {
      var roleId = row.dataset.roleId;
      var cbs = row.querySelectorAll('.perm-cb');
      var allow = 0, deny = 0;
      cbs.forEach(function(cb) {
        var flag = parseInt(cb.dataset.flag);
        if (cb.checked) allow |= flag;
        else deny |= flag;
      });
      // Only send if there's actually a permission state to record
      if (allow !== 0 || deny !== 0) {
        overwrites.push({ id: roleId, type: 0, allow: allow, deny: deny });
      }
    });

    // Critical: read current overwrites first, merge, then save each role individually
    api('GET', '/channels/' + cpSelectedChannelId + '/permissions').then(function(data) {
      var existingOverwrites = (data.overwrites || []).map(function(o) {
        return { id: o.id, type: o.type, allow: o.allow || 0, deny: o.deny || 0 };
      });

      // Build map of existing overwrites
      var existingMap = {};
      existingOverwrites.forEach(function(o) { existingMap[o.id] = o; });

      // Update only the roles we changed — preserve all others
      var updated = overwrites.map(function(newOw) {
        var existing = existingMap[newOw.id] || { allow: 0, deny: 0 };
        // Merge: keep existing allow/deny for flags we didn't touch
        var mergedAllow = (existing.allow & ~newOw.allow) | newOw.allow;
        var mergedDeny = (existing.deny & ~newOw.deny) | newOw.deny;
        return { id: newOw.id, type: newOw.type, allow: mergedAllow, deny: mergedDeny };
      });

      // Send each role overwrite as a separate PATCH
      var promises = updated.map(function(ow) {
        return api('PATCH', '/channels/' + cpSelectedChannelId, {
          permission_overwrites: [{ id: ow.id, type: ow.type, allow: ow.allow, deny: ow.deny }]
        });
      });

      return Promise.all(promises);
    }).then(function(results) {
      btn.disabled = false; btn.textContent = 'Save Changes';
      var errors = results.filter(function(r) { return !r.ok && !r.channel; });
      if (errors.length > 0) showToast('Some changes failed: ' + errors[0].error, 'error');
      else showToast('Permissions saved to Discord');
      // Refresh current overwrites
      api('GET', '/channels/' + cpSelectedChannelId + '/permissions').then(function(data) {
        cpCurrentOverwrites = (data.overwrites || []).map(function(o) {
          return { id: o.id, type: o.type, allow: o.allow, deny: o.deny };
        });
        renderFullPermissionTable(cpSelectedChannelId, data.channelName);
      });
    }).catch(function(err) {
      btn.disabled = false; btn.textContent = 'Save Changes';
      showToast('Request failed: ' + err.message, 'error');
    });
  };

  window.clearChannelPanel = function() {
    cpSelectedChannelId = null;
    $('cp-permission-panel').style.display = 'none';
    $('cp-empty-panel').style.display = '';
    cpCurrentOverwrites = [];
    renderChannelTree();
  };

  // Apply permissions to all channels in a category
  window.applyToCategory = function(sourceChannelId, categoryId) {
    if (!confirm('Apply this channel\u2019s permissions to all channels in this category?')) return;
    var catChannels = cpChannels.filter(function(c) { return c.parentId === categoryId && c.type !== 4; });
    var count = 0;
    var errors = 0;
    catChannels.forEach(function(ch) {
      if (ch.id === sourceChannelId) { count++; return; }
      api('GET', '/channels/' + ch.id + '/permissions').then(function(data) {
        var existingOverwrites = (data.overwrites || []).map(function(o) {
          return { id: o.id, type: o.type, allow: o.allow || 0, deny: o.deny || 0 };
        });
        var existingMap = {};
        existingOverwrites.forEach(function(o) { existingMap[o.id] = o; });

        // Get the source channel's current overwrites
        var srcOverwrites = {};
        cpCurrentOverwrites.forEach(function(o) { srcOverwrites[o.id] = o; });

        var merged = existingOverwrites.map(function(ow) {
          var src = srcOverwrites[ow.id];
          if (src) {
            var mergedAllow = (ow.allow & ~src.allow) | src.allow;
            var mergedDeny = (ow.deny & ~src.deny) | src.deny;
            return { id: ow.id, type: ow.type, allow: mergedAllow, deny: mergedDeny };
          }
          return ow;
        });

        // Add any new overwrites from source not in target
        Object.keys(srcOverwrites).forEach(function(id) {
          if (!existingMap[id]) merged.push(srcOverwrites[id]);
        });

        var promises = merged.map(function(ow) {
          return api('PATCH', '/channels/' + ch.id, {
            permission_overwrites: [{ id: ow.id, type: ow.type, allow: ow.allow, deny: ow.deny }]
          });
        });
        Promise.all(promises).then(function() { count++; });
      }).catch(function() { errors++; });
    });
    showToast('Applying permissions to ' + catChannels.length + ' channels...');
  };

  // ── Sync from Discord ───────────────────────────────────────────────────
  window.syncServerStructure = function() {
    var btn = $('sync-structure-btn');
    if (!btn) return;
    btn.disabled = true; btn.textContent = '🔄 Syncing...';
    api('POST', '/sync-structure').then(function(data) {
      btn.disabled = false; btn.textContent = '🔄 Sync from Discord';
      if (data.ok) {
        showToast('Synced ' + data.structure.rolesCount + ' roles, ' + data.structure.channelsCount + ' channels from Discord');
        refreshChannels();
      } else {
        showToast('Sync failed: ' + (data.error || 'Unknown error'), 'error');
      }
    }).catch(function(err) {
      btn.disabled = false; btn.textContent = '🔄 Sync from Discord';
      showToast('Sync failed: ' + err.message, 'error');
    });
  };

  // ── Category modals ──────────────────────────────────────────────────────

  window.openCreateCategoryModal = function() {
    $('cat-name').value = '';
    $('create-category-modal').style.display = '';
    $('cat-name').focus();
  };

  window.submitCreateCategory = function() {
    var name = $('cat-name').value.trim();
    if (!name) { showToast('Category name is required', 'error'); return; }
    api('POST', '/categories', { name: name }).then(function(data) {
      if (data.ok) {
        showToast('Category "' + data.category.name + '" created');
        closeModal('create-category-modal');
        refreshChannels();
      } else {
        showToast(data.error || 'Failed to create category', 'error');
      }
    }).catch(function() { showToast('Request failed', 'error'); });
  };

  window.openRenameCategory = function(categoryId, currentName) {
    $('rc-category-id').value = categoryId;
    $('rc-current-name').textContent = currentName;
    $('rc-new-name').value = currentName;
    $('rename-category-modal').style.display = '';
    $('rc-new-name').focus();
    $('rc-new-name').select();
  };

  window.submitRenameCategory = function() {
    var categoryId = $('rc-category-id').value;
    var newName = $('rc-new-name').value.trim();
    if (!newName) { showToast('Category name is required', 'error'); return; }
    api('PATCH', '/categories/' + categoryId, { name: newName }).then(function(data) {
      if (data.ok) {
        showToast('Category renamed to "' + newName + '"');
        closeModal('rename-category-modal');
        refreshChannels();
      } else {
        showToast(data.error || 'Failed to rename category', 'error');
      }
    }).catch(function() { showToast('Request failed', 'error'); });
  };

  window.openDeleteCategory = function(categoryId, categoryName) {
    $('dc-category-id').value = categoryId;
    $('dc-cat-name').textContent = categoryName;
    $('dc-confirm-name').value = '';
    $('dc-confirm-warning').style.display = 'none';
    $('delete-category-modal').style.display = '';
  };

  window.submitDeleteCategory = function() {
    var categoryId = $('dc-category-id').value;
    var confirmName = $('dc-confirm-name').value.trim();
    var actualName = $('dc-cat-name').textContent;
    if (confirmName !== actualName) {
      $('dc-confirm-warning').style.display = '';
      return;
    }
    api('DELETE', '/categories/' + categoryId).then(function(data) {
      if (data.ok) {
        showToast('Category deleted');
        closeModal('delete-category-modal');
        refreshChannels();
      } else {
        showToast(data.error || 'Failed to delete category', 'error');
      }
    }).catch(function() { showToast('Request failed', 'error'); });
  };

  // ── Channel reorder ──────────────────────────────────────────────────────

  window.moveChannel = function(channelId, direction) {
    // Find current channel position and siblings
    var ch = cpChannels.find(function(c) { return c.id === channelId; });
    if (!ch) return;
    var siblings = cpChannels.filter(function(c) {
      return c.type !== 4 && c.parentId === ch.parentId && c.id !== channelId;
    });
    // Sort by position
    siblings.sort(function(a, b) { return a.position - b.position; });
    var newPosition;
    if (direction === 'up') {
      var idx = siblings.findIndex(function(s) { return s.id === channelId; });
      // Find closest channel with lower or equal position
      var all = cpChannels.filter(function(c) { return c.type !== 4 && c.parentId === ch.parentId; });
      all.sort(function(a, b) { return a.position - b.position; });
      var chIdx = all.findIndex(function(c) { return c.id === channelId; });
      if (chIdx <= 0) { showToast('Already at top'); return; }
      newPosition = all[chIdx - 1].position - 1;
    } else {
      var all2 = cpChannels.filter(function(c) { return c.type !== 4 && c.parentId === ch.parentId; });
      all2.sort(function(a, b) { return a.position - b.position; });
      var chIdx2 = all2.findIndex(function(c) { return c.id === channelId; });
      if (chIdx2 >= all2.length - 1) { showToast('Already at bottom'); return; }
      newPosition = all2[chIdx2 + 1].position + 1;
    }
    api('POST', '/channels/' + channelId + '/reorder', { position: newPosition }).then(function(data) {
      if (data.ok) {
        showToast('Channel moved');
        refreshChannels();
      } else {
        showToast(data.error || 'Failed to move channel', 'error');
      }
    }).catch(function() { showToast('Request failed', 'error'); });
  };

  // ── Category reorder ────────────────────────────────────────────────────

  window.moveCategory = function(categoryId, direction) {
    var cats = cpChannels.filter(function(c) { return c.type === 4; });
    cats.sort(function(a, b) { return a.position - b.position; });
    var idx = cats.findIndex(function(c) { return c.id === categoryId; });
    if (direction === 'up') {
      if (idx <= 0) { showToast('Already at top'); return; }
      var newPos = cats[idx - 1].position - 1;
      api('PATCH', '/categories/' + categoryId, { position: newPos }).then(function(data) {
        if (data.ok) { showToast('Category moved'); refreshChannels(); }
        else showToast(data.error || 'Failed', 'error');
      }).catch(function() { showToast('Request failed', 'error'); });
    } else {
      if (idx >= cats.length - 1) { showToast('Already at bottom'); return; }
      var newPos2 = cats[idx + 1].position + 1;
      api('PATCH', '/categories/' + categoryId, { position: newPos2 }).then(function(data) {
        if (data.ok) { showToast('Category moved'); refreshChannels(); }
        else showToast(data.error || 'Failed', 'error');
      }).catch(function() { showToast('Request failed', 'error'); });
    }
  };

  // Create channel modal
  window.openCreateChannelModal = function() {
    openCreateChannelInCategory(null);
  };

  window.openCreateChannelInCategory = function(categoryId) {
    $('cm-channel-name').value = '';
    $('cm-channel-type-0').checked = true;
    $('cm-channel-topic').value = '';

    // Populate category dropdown
    var catMap = {};
    cpChannels.forEach(function(c) { if (c.type === 4) catMap[c.id] = c.name; });
    var catSelect = $('cm-parent-cat');
    catSelect.innerHTML = '<option value="">No category</option>';
    Object.keys(catMap).forEach(function(id) {
      catSelect.innerHTML += '<option value="' + id + '">' + escHtml(catMap[id]) + '</option>';
    });

    if (categoryId) catSelect.value = categoryId;

    $('create-channel-modal').style.display = '';
    $('cm-channel-name').focus();
  };

  window.submitCreateChannel = function() {
    var name = $('cm-channel-name').value.trim();
    if (!name) { showToast('Channel name is required', 'error'); return; }
    var type = $('cm-channel-type-2').checked ? 2 : 0;
    var parentId = $('cm-parent-cat').value || null;
    var topic = $('cm-channel-topic').value.trim() || null;

    var body = { name: name, type: type };
    if (parentId) body.parentId = parentId;
    if (topic) body.topic = topic;

    api('POST', '/channels', body).then(function(data) {
      if (data.ok) {
        showToast('Channel "' + data.channel.name + '" created');
        closeModal('create-channel-modal');
        refreshChannels();
      } else {
        showToast(data.error || 'Failed to create channel', 'error');
      }
    }).catch(function() { showToast('Request failed', 'error'); });
  };

  // Rename channel modal
  window.openRenameChannel = function(channelId, currentName) {
    $('rm-channel-id').value = channelId;
    $('rm-current-name').textContent = currentName;
    $('rm-new-name').value = currentName;
    $('rename-channel-modal').style.display = '';
    $('rm-new-name').focus();
    $('rm-new-name').select();
  };

  window.submitRenameChannel = function() {
    var channelId = $('rm-channel-id').value;
    var newName = $('rm-new-name').value.trim();
    if (!newName) { showToast('Channel name is required', 'error'); return; }
    api('PATCH', '/channels/' + channelId, { name: newName }).then(function(data) {
      if (data.ok) {
        showToast('Channel renamed to "' + newName + '"');
        closeModal('rename-channel-modal');
        refreshChannels();
      } else {
        showToast(data.error || 'Failed to rename channel', 'error');
      }
    }).catch(function() { showToast('Request failed', 'error'); });
  };

  // Delete channel modal
  window.openDeleteChannel = function(channelId, channelName) {
    $('dm-channel-id').value = channelId;
    $('dm-channel-name').textContent = channelName;
    $('dm-confirm-name').value = '';
    $('dm-confirm-warning').style.display = 'none';
    $('delete-channel-modal').style.display = '';
  };

  window.submitDeleteChannel = function() {
    var channelId = $('dm-channel-id').value;
    var confirmName = $('dm-confirm-name').value.trim();
    var actualName = $('dm-channel-name').textContent;
    if (confirmName !== actualName) {
      $('dm-confirm-warning').style.display = '';
      return;
    }
    api('DELETE', '/channels/' + channelId).then(function(data) {
      if (data.ok) {
        showToast('Channel deleted');
        closeModal('delete-channel-modal');
        if (cpSelectedChannelId === channelId) clearChannelPanel();
        refreshChannels();
      } else {
        showToast(data.error || 'Failed to delete channel', 'error');
      }
    }).catch(function() { showToast('Request failed', 'error'); });
  };

  function closeModal(modalId) {
    $(modalId).style.display = 'none';
  }

  window.closeModal = closeModal;

  function refreshChannels() {
    api('GET', '/server').then(function(d) {
      cpChannels = d.channels || [];
      cpRoles = d.roles || [];
      renderChannelTree();
    });
  }

  // ─══════════════════════════════════════════════════════════════════════
  // TAB: ROLE SETTINGS
  // ─══════════════════════════════════════════════════════════════════════

  var rsRoles = [];

  function loadRolesSettingsTab() {
    if (rsRoles.length > 0) return;
    api('GET', '/server').then(function(data) {
      rsRoles = data.roles || [];
      renderRoleSettingsList();
    });
  }

  function renderRoleSettingsList() {
    var html = '<table class="dc-table"><thead><tr>' +
      '<th>Role</th>' +
      '<th>Color</th>' +
      '<th class="text-center">Hoist</th>' +
      '<th class="text-center">Mentionable</th>' +
      '<th class="text-center">Position</th>' +
      '<th>Actions</th>' +
      '</tr></thead><tbody>';

    rsRoles.forEach(function(r) {
      if (r.name === '@everyone') {
        html += '' +
          '<tr data-role-id="' + r.id + '">' +
            '<td><strong>@everyone</strong> <span style="font-size:0.7rem;color:var(--muted);">base permissions</span></td>' +
            '<td colspan="3"></td>' +
            '<td class="text-center" style="color:var(--muted);">—</td>' +
            '<td><span style="font-size:0.75rem;color:var(--muted);">Built-in</span></td>' +
          '</tr>';
        return;
      }
      var colorSwatch = '<span class="role-swatch" style="background:' + (r.colorHex || '#99aab5') + '"></span>';
      html += '' +
        '<tr data-role-id="' + r.id + '">' +
          '<td>' + colorSwatch + ' <span class="role-name">' + escHtml(r.name) + '</span>' +
          (r.managed ? ' <span class="badge-managed">BOT</span>' : '') + '</td>' +
          '<td><input type="color" value="' + r.colorHex + '" class="rs-color-' + r.id + '" style="width:32px;height:28px;padding:0;border:1px solid var(--border);border-radius:4px;cursor:pointer;"></td>' +
          '<td style="text-align:center;"><input type="checkbox" class="rs-hoist" data-id="' + r.id + '" ' + (r.hoist ? 'checked' : '') + '></td>' +
          '<td style="text-align:center;"><input type="checkbox" class="rs-mentionable" data-id="' + r.id + '" ' + (r.mentionable ? 'checked' : '') + '></td>' +
          '<td class="text-center" style="color:var(--muted);">' + r.position + '</td>' +
          '<td>' +
            (r.managed ? '<span style="font-size:0.75rem;color:var(--muted);">Managed</span>' :
              '<button class="btn btn-sm btn-ghost" onclick="rsUpdateRole(\u0027' + r.id + '\u0027)">Save</button>') +
          '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    setHtml('rs-role-table', html);
  }

  window.rsUpdateRole = function(roleId) {
    var row = document.querySelector('[data-role-id="' + roleId + '"]');
    if (!row) return;
    var colorInput = row.querySelector('input[type=color]');
    var hoistInput = row.querySelector('.rs-hoist');
    var mentionableInput = row.querySelector('.rs-mentionable');
    var color = colorInput ? parseInt(colorInput.value.replace('#', ''), 16) : undefined;
    var body = {};
    if (color !== undefined) body.color = color;
    if (hoistInput) body.hoist = hoistInput.checked;
    if (mentionableInput) body.mentionable = mentionableInput.checked;
    api('PUT', '/roles/' + roleId, body).then(function(data) {
      if (data.ok) {
        showToast('Role updated in Discord');
        // Refresh roles
        api('GET', '/server').then(function(d) {
          rsRoles = d.roles || [];
          renderRoleSettingsList();
        });
      } else {
        showToast(data.error || 'Failed to update role', 'error');
      }
    });
  };

  // ── Init ──────────────────────────────────────────────────────────────
  loadServerInfo();
})();