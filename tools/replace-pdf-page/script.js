const { PDFDocument } = PDFLib;

    const origInput = document.getElementById("orig");
    const newInput = document.getElementById("newp");
    const origMeta = document.getElementById("origMeta");
    const newMeta = document.getElementById("newMeta");
    const targetPage = document.getElementById("targetPage");
    const sourcePage = document.getElementById("sourcePage");
    const targetHint = document.getElementById("targetHint");
    const sourceHint = document.getElementById("sourceHint");
    const summary = document.getElementById("summary");
    const go = document.getElementById("go");
    const reset = document.getElementById("reset");
    const statusEl = document.getElementById("status");

    const state = { origFile: null, newFile: null, origPages: 0, newPages: 0 };

    function setStatus(type, text) {
      statusEl.className = "status show " + type;
      statusEl.textContent = text;
    }

    function clamp(n, min, max) {
      n = parseInt(n, 10);
      if (!Number.isFinite(n)) return min;
      return Math.min(max, Math.max(min, n));
    }

    function updatePlan() {
      const hasOrig = !!state.origFile;
      const hasNew = !!state.newFile;
      go.disabled = !(hasOrig && hasNew && state.origPages > 0 && state.newPages > 0);

      if (hasOrig) {
        targetPage.disabled = false;
        targetPage.max = String(state.origPages);
        targetPage.value = String(clamp(targetPage.value, 1, state.origPages));
        targetHint.textContent = "Allowed: 1 to " + state.origPages + ".";
      } else {
        targetPage.disabled = true;
        targetHint.textContent = "Load the combined PDF first.";
      }

      if (hasNew) {
        sourcePage.disabled = false;
        sourcePage.max = String(state.newPages);
        sourcePage.value = String(clamp(sourcePage.value, 1, state.newPages));
        sourceHint.textContent = "Allowed: 1 to " + state.newPages + ".";
      } else {
        sourcePage.disabled = true;
        sourceHint.textContent = "Load the replacement PDF first.";
      }

      if (hasOrig && hasNew) {
        const t = clamp(targetPage.value, 1, state.origPages);
        const s = clamp(sourcePage.value, 1, state.newPages);
        summary.textContent = "Replace page " + t + " of " + escapeHtml(state.origFile.name) +
          " (" + state.origPages + " pages) with page " + s + " of " +
          state.newFile.name + " (" + state.newPages + " pages). Page count stays " +
          state.origPages + ".";
      } else {
        summary.textContent = "Select both files to see the swap plan.";
      }
    }

    async function inspect(file) {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      return { pages: doc.getPageCount() };
    }

    async function onFile(kind, file) {
      if (!file) return;
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setStatus("err", "Please choose a PDF file.");
        return;
      }
      setStatus("info", "Reading " + file.name + " ...");
      try {
        const info = await inspect(file);
        if (info.pages < 1) throw new Error("That PDF has no pages.");
        if (kind === "orig") {
          state.origFile = file;
          state.origPages = info.pages;
          origMeta.innerHTML = "<strong>" + escapeHtml(file.name) + "</strong><br>" +
            info.pages + " page" + (info.pages === 1 ? "" : "s") + " · " + fmtSize(file.size);
          document.getElementById("dropOrig").classList.add("has");
        } else {
          state.newFile = file;
          state.newPages = info.pages;
          newMeta.innerHTML = "<strong>" + escapeHtml(file.name) + "</strong><br>" +
            info.pages + " page" + (info.pages === 1 ? "" : "s") + " · " + fmtSize(file.size);
          document.getElementById("dropNew").classList.add("has");
        }
        setStatus("ok", "File loaded.");
        updatePlan();
      } catch (err) {
        setStatus("err", "Could not read that PDF. It may be damaged or use unsupported encryption. " +
          (err && err.message ? err.message : ""));
      }
    }

    origInput.addEventListener("change", e => onFile("orig", e.target.files[0]));
    newInput.addEventListener("change", e => onFile("new", e.target.files[0]));
    targetPage.addEventListener("input", updatePlan);
    sourcePage.addEventListener("input", updatePlan);

    function wireDrop(el, kind) {
      el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("over"); });
      el.addEventListener("dragleave", () => el.classList.remove("over"));
      el.addEventListener("drop", e => {
        e.preventDefault();
        el.classList.remove("over");
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (kind === "orig") origInput.files = e.dataTransfer.files;
        else newInput.files = e.dataTransfer.files;
        onFile(kind, file);
      });
    }
    wireDrop(document.getElementById("dropOrig"), "orig");
    wireDrop(document.getElementById("dropNew"), "new");

    reset.addEventListener("click", () => {
      state.origFile = null; state.newFile = null; state.origPages = 0; state.newPages = 0;
      origInput.value = ""; newInput.value = "";
      targetPage.value = "1"; sourcePage.value = "1";
      origMeta.textContent = "The document that contains the page you want to replace.";
      newMeta.textContent = "The PDF that holds the new page. It can have one page or many.";
      document.getElementById("dropOrig").classList.remove("has");
      document.getElementById("dropNew").classList.remove("has");
      statusEl.className = "status";
      statusEl.textContent = "";
      updatePlan();
    });

    go.addEventListener("click", async () => {
      if (!state.origFile || !state.newFile) return;
      const t = clamp(targetPage.value, 1, state.origPages);
      const s = clamp(sourcePage.value, 1, state.newPages);
      targetPage.value = String(t);
      sourcePage.value = String(s);

      go.disabled = true;
      setStatus("info", "Replacing page " + t + " ...");
      try {
        const origBytes = await state.origFile.arrayBuffer();
        const newBytes = await state.newFile.arrayBuffer();
        const orig = await PDFDocument.load(origBytes, { ignoreEncryption: true });
        const repl = await PDFDocument.load(newBytes, { ignoreEncryption: true });

        const origCount = orig.getPageCount();
        const newCount = repl.getPageCount();
        if (t < 1 || t > origCount) throw new Error("Combined PDF page must be between 1 and " + origCount + ".");
        if (s < 1 || s > newCount) throw new Error("Replacement PDF page must be between 1 and " + newCount + ".");

        const out = await PDFDocument.create();
        const title = orig.getTitle();
        const author = orig.getAuthor();
        if (title) out.setTitle(title);
        if (author) out.setAuthor(author);

        const targetIdx = t - 1;
        const sourceIdx = s - 1;

        const before = [];
        for (let i = 0; i < targetIdx; i++) before.push(i);
        const after = [];
        for (let i = targetIdx + 1; i < origCount; i++) after.push(i);

        if (before.length) {
          const pages = await out.copyPages(orig, before);
          pages.forEach(p => out.addPage(p));
        }
        const [replacement] = await out.copyPages(repl, [sourceIdx]);
        out.addPage(replacement);
        if (after.length) {
          const pages = await out.copyPages(orig, after);
          pages.forEach(p => out.addPage(p));
        }

        const saved = await out.save();
        const blob = new Blob([saved], { type: "application/pdf" });
        const name = baseName(state.origFile.name) + "-page" + t + "-replaced.pdf";
        downloadBlob(blob, name);
        setStatus("ok", "Done. Replaced page " + t + " with replacement page " + s +
          ". Downloaded " + name + " (" + out.getPageCount() + " pages).");
      } catch (err) {
        setStatus("err", "Replace failed. " + (err && err.message ? err.message : String(err)));
      } finally {
        updatePlan();
      }
    });

    function downloadBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    function baseName(name) { return name.replace(/\.pdf$/i, ""); }
    function fmtSize(n) {
      if (n < 1024) return n + " B";
      if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
      return (n / 1048576).toFixed(2) + " MB";
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
    }

    updatePlan();
