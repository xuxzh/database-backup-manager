const state = {
  token: localStorage.getItem("token"),
  sources: [],
  targets: [],
  jobs: [],
};

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || res.statusText);
  return data;
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const key of ["port", "remoteRetentionDays", "localRetentionDays"]) {
    if (key in data) data[key] = Number(data[key]);
  }
  if ("enabled" in form.elements) data.enabled = form.elements.enabled.checked;
  return data;
}

function showToast(message = "") {
  $("#toast").textContent = message;
}

async function login(event) {
  event.preventDefault();
  $("#loginError").textContent = "";
  try {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify(formData(event.target)) });
    state.token = data.token;
    localStorage.setItem("token", data.token);
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    await refresh();
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
}

function setTab(tab) {
  document.querySelectorAll("aside button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((panel) => panel.classList.toggle("active", panel.id === tab));
  const titles = {
    dashboard: ["仪表盘", "查看备份任务和最近运行状态"],
    sources: ["数据源", "配置 MySQL 和 PostgreSQL 连接"],
    targets: ["备份目标", "配置 SSH 远端备份服务器"],
    jobs: ["备份任务", "配置周期任务并手动触发备份"],
    runs: ["运行记录", "查看执行结果和阶段日志"],
  };
  $("#pageTitle").textContent = titles[tab][0];
  $("#pageHint").textContent = titles[tab][1];
}

async function refresh() {
  showToast("");
  const [dashboard, sources, targets, jobs, runs] = await Promise.all([
    api("/dashboard"),
    api("/sources"),
    api("/targets"),
    api("/jobs"),
    api("/runs"),
  ]);
  state.sources = sources;
  state.targets = targets;
  state.jobs = jobs;
  renderDashboard(dashboard);
  renderSources(sources);
  renderTargets(targets);
  renderJobs(jobs);
  renderRuns(runs);
  fillJobOptions();
}

function renderDashboard(data) {
  $("#sourceCount").textContent = data.sourceCount;
  $("#targetCount").textContent = data.targetCount;
  $("#jobCount").textContent = data.jobCount;
  $("#successCount").textContent = data.todaySuccessCount;
  $("#failedCount").textContent = data.todayFailedCount;
  $("#latestRun").textContent = data.latestRun ? JSON.stringify(data.latestRun, null, 2) : "暂无运行记录";
}

function renderSources(items) {
  $("#sourceList").innerHTML = table(["名称", "类型", "主机", "端口", "用户", "默认数据库"], items.map((item) => [
    item.name,
    item.dbType,
    item.host,
    item.port,
    item.username,
    item.databaseName || "",
  ]));
}

function renderTargets(items) {
  $("#targetList").innerHTML = table(["名称", "类型", "主机", "端口", "用户", "远端目录"], items.map((item) => [
    item.name,
    item.targetType,
    item.host,
    item.port,
    item.username,
    item.baseDir,
  ]));
}

function renderJobs(items) {
  $("#jobList").innerHTML = table(["名称", "数据源", "数据库", "目标", "计划", "启用", "操作"], items.map((item) => [
    item.name,
    nameById(state.sources, item.databaseConnectionId),
    item.databaseName,
    nameById(state.targets, item.backupTargetId),
    item.schedule,
    item.enabled ? "是" : "否",
    `<button data-run="${item.id}">立即执行</button>`,
  ]));
}

function renderRuns(items) {
  $("#runList").innerHTML = table(["任务", "状态", "阶段", "开始时间", "结束时间", "错误", "日志"], items.map((item) => [
    nameById(state.jobs, item.backupJobId),
    item.status,
    item.stage,
    item.startedAt,
    item.finishedAt || "",
    item.errorMessage || "",
    `<button data-logs="${item.id}">查看</button>`,
  ]));
}

function table(headers, rows) {
  if (!rows.length) return "<p style='padding:14px'>暂无数据</p>";
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function nameById(items, id) {
  return items.find((item) => item.id === id)?.name || id;
}

function fillJobOptions() {
  $("#jobSource").innerHTML = state.sources.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  $("#jobTarget").innerHTML = state.targets.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
}

async function submitSource(event) {
  event.preventDefault();
  await api("/sources", { method: "POST", body: JSON.stringify({ ...formData(event.target), configJson: {} }) });
  event.target.reset();
  showToast("数据源已保存");
  await refresh();
}

async function submitTarget(event) {
  event.preventDefault();
  await api("/targets", {
    method: "POST",
    body: JSON.stringify({ ...formData(event.target), targetType: "ssh", configJson: {} }),
  });
  event.target.reset();
  showToast("备份目标已保存");
  await refresh();
}

async function submitJob(event) {
  event.preventDefault();
  await api("/jobs", { method: "POST", body: JSON.stringify(formData(event.target)) });
  event.target.reset();
  showToast("备份任务已保存");
  await refresh();
}

document.addEventListener("click", async (event) => {
  const tab = event.target.dataset?.tab;
  if (tab) setTab(tab);
  const runId = event.target.dataset?.run;
  if (runId) {
    await api(`/jobs/${runId}/run`, { method: "POST" });
    showToast("任务已提交执行");
    await refresh();
  }
  const logsId = event.target.dataset?.logs;
  if (logsId) {
    const logs = await api(`/runs/${logsId}/logs`);
    $("#runLogs").textContent = logs.map((log) => `[${log.timestamp}] ${log.level} ${log.stage}: ${log.message}`).join("\n");
  }
});

$("#loginForm").addEventListener("submit", login);
$("#sourceForm").addEventListener("submit", submitSource);
$("#targetForm").addEventListener("submit", submitTarget);
$("#jobForm").addEventListener("submit", submitJob);
$("#refreshBtn").addEventListener("click", refresh);

if (state.token) {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  refresh().catch(() => {
    localStorage.removeItem("token");
    state.token = null;
    $("#login").classList.remove("hidden");
    $("#app").classList.add("hidden");
  });
}
