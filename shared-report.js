const token = new URLSearchParams(location.search).get("token") || "";
const tokenPattern = /^[a-f0-9]{48}$/;
const filename = document.getElementById("reportFilename");
const expiry = document.getElementById("reportExpiry");
const downloadButton = document.getElementById("downloadReportBtn");
const stateMessage = document.getElementById("stateMessage");

function expiryText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "链接将在24小时内失效";
  return `有效至 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)}`;
}

function showError(message) {
  filename.textContent = "报告暂时无法领取";
  expiry.textContent = "请联系报告发送人重新生成链接";
  downloadButton.hidden = true;
  stateMessage.className = "state-message error";
  stateMessage.querySelector("span").textContent = message;
}

async function loadReport() {
  if (!tokenPattern.test(token)) {
    showError("报告链接无效或不完整");
    return;
  }

  try {
    const response = await fetch(`/api/reports/shared/${token}`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "报告链接不存在或已过期");

    filename.textContent = data.filename || "学生功能评估与康复支持报告.docx";
    expiry.textContent = expiryText(data.expiresAt);
    downloadButton.href = `/api/reports/shared/${token}/download`;
    downloadButton.hidden = false;
    stateMessage.className = "state-message ready";
    stateMessage.querySelector("span").textContent = "报告链接有效，可以安全下载";
  } catch (error) {
    showError(error.message || "无法读取报告信息，请稍后重试");
  }
}

downloadButton.addEventListener("click", () => {
  stateMessage.className = "state-message ready";
  stateMessage.querySelector("span").textContent = "正在下载 Word 报告，请勿重复点击";
});

loadReport();
