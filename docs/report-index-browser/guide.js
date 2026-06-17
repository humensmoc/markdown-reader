(function initReportIndexGuideModule() {
  const GUIDE_CHAPTERS = [
    {
      id: "layout",
      title: "第 1 章 · 界面与 Tag 筛选",
      steps: [
        {
          title: "认识三栏布局",
          body: "何时用：第一次打开工具，或不确定某个功能在哪一栏时。\n\n左侧管理 tag 词表与筛选，中间浏览游戏列表，右侧编辑单个游戏的检索字段。请点击任意一栏内的空白区域继续。",
          target: ".workspace",
          placement: "center",
          validate: (state) => state.workspaceClicked,
          onEnter(ctx) {
            ctx.workspaceClicked = false;
            const workspace = document.querySelector(".workspace");
            const handler = () => {
              ctx.workspaceClicked = true;
              workspace?.removeEventListener("click", handler);
            };
            workspace?.addEventListener("click", handler);
            ctx.cleanup = () => workspace?.removeEventListener("click", handler);
          }
        },
        {
          title: "点击 Tag 进行筛选",
          body: "何时用：想查看「拥有某个 tag 的全部游戏」，例如核对 visual identity 或 short-session 下的作品。\n\n在左侧 Tags 列表中点击任意 tag，中间列表会只显示拥有该 tag 的游戏。",
          target: ".tag-pane",
          placement: "right",
          validate: (state) => state.selectedTagKeysSize >= 1
        },
        {
          title: "搜索 Tag",
          body: "何时用：tag 词表很长，你已经知道大概名字，想快速定位而不是逐组展开。\n\n在左侧顶部的「搜索 tag」输入框中输入关键词。",
          target: "#tagSearchInput",
          placement: "right",
          validate: (state) => state.tagSearchValue.length > 0
        },
        {
          title: "多选 Tag 取交集",
          body: "何时用：需要找「同时满足多个检索条件」的游戏，例如既是 puzzle 又适合 short-session 的作品。\n\n再点击另一个 tag；多个 tag 同时选中时，中间列表只显示同时拥有全部 tag 的游戏。",
          target: ".tag-pane .tag-buttons",
          placement: "right",
          validate: (state) => state.selectedTagKeysSize >= 2,
          prepare: (helpers) => helpers.clearTagSearch?.()
        },
        {
          title: "查看已选 Tag 托盘",
          body: "何时用：你在多个 tag 之间来回切换，想保留一组常用筛选而不必每次重新点选。\n\n中间标题下方会出现已固定 tag 的托盘；点击可重新勾选，右键可取消固定。",
          target: "#selectedTagTray",
          placement: "bottom",
          validate: (state) => state.trayVisible
        },
        {
          title: "清除 Tag 筛选",
          body: "何时用：筛选结果太窄、选错 tag，或想回到「全部游戏」做全局浏览。\n\n点击「清除 tag」按钮即可。",
          target: "#clearTagBtn",
          placement: "bottom",
          validate: (state) => state.selectedTagKeysSize === 0,
          prepare: (helpers) => helpers.ensureClearTagVisible()
        }
      ]
    },
    {
      id: "reports",
      title: "第 2 章 · 阅读报告",
      steps: [
        {
          title: "打开 Reports 报告",
          body: "何时用：准备给游戏打 tag、写 annotation_notes，或想确认某游戏是否真的符合某个检索意图时——应优先读报告再标注。\n\n点击游戏行右侧的「Reports」，在新标签页打开 DeepResearch 报告详情。",
          target: ".game-row .reports-link",
          placement: "left",
          validate: (state) => state.reportsLinkClicked,
          prepare: (helpers) => helpers.ensureGameListVisible(),
          onEnter(ctx) {
            ctx.reportsLinkClicked = false;
            const handler = (evt) => {
              if (!evt.target.closest(".reports-link")) return;
              ctx.reportsLinkClicked = true;
              document.removeEventListener("click", handler, true);
            };
            document.addEventListener("click", handler, true);
            ctx.cleanup = () => document.removeEventListener("click", handler, true);
          }
        }
      ]
    },
    {
      id: "game",
      title: "第 3 章 · 编辑游戏",
      steps: [
        {
          title: "搜索游戏",
          body: "何时用：你知道游戏名、appid 或 rank，想直接定位而不是在长列表里滚动。\n\n在中间顶部的搜索框输入关键词。",
          target: "#gameSearchInput",
          placement: "bottom",
          validate: (state) => state.gameSearchValue.length > 0,
          prepare: (helpers) => helpers.ensureAllGamesView()
        },
        {
          title: "选择游戏",
          body: "何时用：你已经确定要编辑哪一款游戏，需要查看或修改它的 tag 与注释。\n\n在中间列表中点击任意一行，右侧会显示该游戏的编辑区域。",
          target: "#gameList",
          placement: "left",
          validate: (state) => state.hasSelectedGame
        },
        {
          title: "编辑 annotation_notes",
          body: "何时用：现有 tag 无法表达的个案信息，例如边界说明、回测依据、为什么某游戏不适合某个 tag。\n\n在右侧「annotation_notes」文本框中输入或修改内容。改动先保存在草稿，需点「保存游戏」才会写回。",
          target: "#notesInput",
          placement: "left",
          validate: (state) => state.notesDirty,
          prepare: (helpers) => helpers.ensureGameSelected()
        },
        {
          title: "添加 Tag 到草稿",
          body: "何时用：读完报告后，确认某游戏应拥有某个 tag，但当前还没有打上。\n\n在右侧任意 tag 分组中，从下拉框选择 tag，再点击「添加到草稿」。",
          target: ".detail-tag-tree",
          placement: "left",
          validate: (state) => state.draftTagsDirty,
          prepare: (helpers) => helpers.ensureGameSelected()
        },
        {
          title: "保存游戏改动",
          body: "何时用：右侧草稿里的 tag 和 notes 都已核对无误，准备正式写入 report_index.json。\n\n点击右上角「保存游戏」。",
          target: "#saveGameBtn",
          placement: "left",
          validate: (state) => state.saveGameClicked,
          prepare: (helpers) => helpers.ensureGameSelected(),
          onEnter(ctx) {
            ctx.saveGameClicked = false;
            const btn = document.querySelector("#saveGameBtn");
            const handler = () => {
              ctx.saveGameClicked = true;
              btn?.removeEventListener("click", handler);
            };
            btn?.addEventListener("click", handler);
            ctx.cleanup = () => btn?.removeEventListener("click", handler);
          }
        }
      ]
    },
    {
      id: "membership",
      title: "第 4 章 · 管理 Tag 成员",
      steps: [
        {
          title: "选中单个 Tag",
          body: "何时用：你要批量维护「某个 tag 下有哪些游戏」，而不是编辑单个游戏的全部字段。\n\n成员管理必须只选中一个 tag；若已多选，请先清除再选一个。",
          target: ".tag-pane",
          placement: "right",
          validate: (state) => state.selectedTagKeysSize === 1,
          prepare: (helpers) => helpers.resetGameDraft()
        },
        {
          title: "打开加入面板",
          body: "何时用：发现某 tag 漏标了应归入的游戏，需要一次性从全库中挑选并批量加入。\n\n点击「搜索游戏加入当前 tag」，展开候选面板。",
          target: "#toggleCandidatePanelBtn",
          placement: "bottom",
          validate: (state) => state.isCandidatePanelOpen,
          prepare: (helpers) => helpers.ensureSingleTagSelected()
        },
        {
          title: "搜索候选游戏",
          body: "何时用：可加入的游戏很多，你已经知道目标游戏名或 appid。\n\n在面板顶部搜索框输入关键词；候选列表显示在搜索框下方。",
          target: "#membershipBar",
          placement: "bottom",
          validate: (state) => state.candidateSearchValue.length > 0,
          prepare: (helpers) => helpers.ensureCandidatePanelOpen()
        },
        {
          title: "勾选候选游戏",
          body: "何时用：你已确认这些游戏读完报告后确实应拥有当前 tag，准备批量加入。\n\n在候选列表中勾选一个或多个游戏。",
          target: "#membershipBar",
          placement: "bottom",
          validate: (state) => state.candidateSelectionCount > 0,
          prepare: (helpers) => helpers.prepareCandidateSelectionStep()
        },
        {
          title: "收起加入面板",
          body: "何时用：已选完要加入的游戏，或决定暂不批量操作，需要回到常规列表视图。\n\n点击面板中的「收起」。",
          target: "#membershipBar",
          placement: "bottom",
          validate: (state) => !state.isCandidatePanelOpen,
          prepare: (helpers) => helpers.ensureCandidatePanelOpen()
        },
        {
          title: "移除 Tag 成员",
          body: "何时用：某游戏被误标了该 tag，或 tag 定义收紧后不再适用——需要从当前 tag 的成员列表中移除。\n\n点击游戏行右侧的「移除并写回」。",
          target: ".game-row .link-danger",
          placement: "left",
          validate: (state) => state.removeMembershipClicked,
          prepare: (helpers) => helpers.ensureSingleTagWithGames(),
          onEnter(ctx) {
            ctx.removeMembershipClicked = false;
            const handler = (evt) => {
              if (!evt.target.closest(".link-danger")) return;
              ctx.removeMembershipClicked = true;
              document.removeEventListener("click", handler, true);
            };
            document.addEventListener("click", handler, true);
            ctx.cleanup = () => document.removeEventListener("click", handler, true);
          }
        }
      ]
    },
    {
      id: "vocabulary",
      title: "第 5 章 · 管理 Tag 词表",
      steps: [
        {
          title: "新建 Tag 表单",
          body: "何时用：现有 vocabulary 无法表达你的检索意图，且确认不是单个游戏的个例（个例应写进 annotation_notes）。\n\n新建前还应回看历史游戏是否需要补标。在左侧选择分类并输入 tag 名称。",
          target: ".tag-toolbar",
          placement: "right",
          validate: (state) => state.newTagInputValue.length > 0,
          prepare: (helpers) => helpers.ensureAllGamesView()
        },
        {
          title: "重命名 Tag",
          body: "何时用：tag 命名不准确、前后不一致，或需要与团队统一用词——且愿意同步影响已引用该 tag 的全部游戏。\n\n选中单个 tag 后，在中间的重命名输入框修改名称。",
          target: "#renameTagInput",
          placement: "bottom",
          validate: (state) => state.renameInputDirty,
          prepare: (helpers) => helpers.ensureSingleTagSelected()
        },
        {
          title: "删除 Tag 入口",
          body: "何时用：tag 冗余重复、定义过细只适用于个别游戏、或确认不应再出现在词表中。删除前请确认是否有游戏仍依赖它。\n\n点击「删除 tag」了解删除流程。",
          target: "#deleteTagBtn",
          placement: "bottom",
          validate: (state) => state.deleteTagClicked,
          prepare: (helpers) => helpers.ensureSingleTagSelected(),
          onEnter(ctx) {
            ctx.deleteTagClicked = false;
            const btn = document.querySelector("#deleteTagBtn");
            const handler = () => {
              ctx.deleteTagClicked = true;
              btn?.removeEventListener("click", handler);
            };
            btn?.addEventListener("click", handler);
            ctx.cleanup = () => btn?.removeEventListener("click", handler);
          }
        }
      ]
    },
    {
      id: "tools",
      title: "第 6 章 · 界面工具与外链",
      steps: [
        {
          title: "切换日夜间主题",
          body: "何时用：长时间标注时减轻视觉疲劳，或在不同光线环境下提升可读性。\n\n点击顶栏「夜间 / 日间」按钮；偏好会保存在浏览器本地。",
          target: "#themeBtn",
          placement: "bottom",
          validate: (state, ctx) => state.isDarkMode !== ctx.startThemeDark,
          onEnter(ctx, helpers) {
            ctx.startThemeDark = helpers.getState().isDarkMode;
          }
        },
        {
          title: "刷新索引",
          body: "何时用：其他人刚更新了 report_index.json、你刚在外部改了文件，或怀疑当前页面数据不是最新。\n\n点击顶栏「刷新」重新加载。若有未保存草稿，可先取消提示。",
          target: "#refreshBtn",
          placement: "bottom",
          validate: (state) => state.refreshClicked,
          onEnter(ctx) {
            ctx.refreshClicked = false;
            const btn = document.querySelector("#refreshBtn");
            const handler = () => {
              ctx.refreshClicked = true;
              btn?.removeEventListener("click", handler);
            };
            btn?.addEventListener("click", handler);
            ctx.cleanup = () => btn?.removeEventListener("click", handler);
          }
        },
        {
          title: "打开 Steam 商店页",
          body: "何时用：需要核对官方名称、发售日期、评价数据，或确认列表里的游戏是不是你要找的那一款。\n\n点击游戏行右侧的「Steam」链接。",
          target: ".game-row .steam-link",
          placement: "left",
          validate: (state) => state.steamLinkClicked,
          prepare: (helpers) => helpers.ensureGameListVisible(),
          onEnter(ctx) {
            ctx.steamLinkClicked = false;
            const handler = (evt) => {
              if (!evt.target.closest(".steam-link")) return;
              ctx.steamLinkClicked = true;
              document.removeEventListener("click", handler, true);
            };
            document.addEventListener("click", handler, true);
            ctx.cleanup = () => document.removeEventListener("click", handler, true);
          }
        },
        {
          title: "引导完成",
          body: "你已完成全部章节！可随时点击顶栏「?」再次进入交互式引导复习操作流程。",
          target: "#helpBtn",
          placement: "bottom",
          validate: () => true
        }
      ]
    }
  ];

  let helpers = null;
  let active = false;
  let chapterIndex = 0;
  let stepIndex = 0;
  let pollTimer = null;
  let stepContext = {};

  const root = document.getElementById("guideRoot");
  const highlight = document.getElementById("guideHighlight");
  const chapterEl = document.getElementById("guideChapter");
  const titleEl = document.getElementById("guideStepTitle");
  const bodyEl = document.getElementById("guideStepBody");
  const hintEl = document.getElementById("guideHint");
  const progressEl = document.getElementById("guideProgress");
  const progressBarEl = document.getElementById("guideProgressBar");
  const prevBtn = document.getElementById("guidePrevBtn");
  const nextBtn = document.getElementById("guideNextBtn");
  const exitBtn = document.getElementById("guideExitBtn");
  const chapterListEl = document.getElementById("guideChapterList");
  const guideCard = document.getElementById("guideCard");
  const guideCardHead = document.getElementById("guideCardHead");

  let cardDragged = false;
  let dragState = null;
  let activeHighlightTarget = null;

  function currentFlatIndex() {
    let index = 0;
    for (let ci = 0; ci < chapterIndex; ci += 1) index += GUIDE_CHAPTERS[ci].steps.length;
    return index + stepIndex;
  }

  function totalSteps() {
    return GUIDE_CHAPTERS.reduce((sum, chapter) => sum + chapter.steps.length, 0);
  }

  function getCurrentStep() {
    return GUIDE_CHAPTERS[chapterIndex]?.steps[stepIndex] || null;
  }

  function renderChapterList() {
    if (!chapterListEl) return;
    chapterListEl.innerHTML = "";
    GUIDE_CHAPTERS.forEach((chapter, ci) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "guide-chapter-link";
      if (ci === chapterIndex) button.classList.add("active");
      if (ci < chapterIndex || (ci === chapterIndex && stepIndex > 0)) button.classList.add("visited");
      button.textContent = chapter.title;
      button.addEventListener("click", () => jumpToChapter(ci));
      item.appendChild(button);
      chapterListEl.appendChild(item);
    });
  }

  function jumpToChapter(ci) {
    if (ci < 0 || ci >= GUIDE_CHAPTERS.length) return;
    cleanupStep();
    chapterIndex = ci;
    stepIndex = 0;
    enterStep(false);
  }

  function clearHighlightTarget() {
    if (activeHighlightTarget) {
      activeHighlightTarget.classList.remove("guide-target-active");
      activeHighlightTarget = null;
    }
  }

  function updateHighlight(targetSelector) {
    clearHighlightTarget();
    if (!highlight) return;
    if (!targetSelector) {
      highlight.classList.add("hidden");
      return;
    }
    const target = document.querySelector(targetSelector);
    if (!target || target.classList.contains("hidden")) {
      highlight.classList.add("hidden");
      return;
    }
    target.classList.add("guide-target-active");
    activeHighlightTarget = target;
    const rect = target.getBoundingClientRect();
    const pad = 8;
    highlight.classList.remove("hidden");
    highlight.style.top = `${Math.max(0, rect.top - pad)}px`;
    highlight.style.left = `${Math.max(0, rect.left - pad)}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;
  }

  function scrollTargetIntoView(targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target || target.classList.contains("hidden")) return;
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function resetCardLayout() {
    cardDragged = false;
    dragState = null;
    if (!guideCard) return;
    guideCard.classList.remove("dragging");
    guideCard.style.top = "";
    guideCard.style.left = "";
    guideCard.style.right = "";
    guideCard.style.bottom = "";
    guideCard.style.transform = "";
  }

  function clampCardPosition(left, top) {
    if (!guideCard) return { left: 0, top: 0 };
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - guideCard.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - guideCard.offsetHeight - margin);
    return {
      left: Math.min(Math.max(margin, left), maxLeft),
      top: Math.min(Math.max(margin, top), maxTop)
    };
  }

  function applyCardPosition(left, top, dragged = true) {
    if (!guideCard) return;
    const next = clampCardPosition(left, top);
    guideCard.style.transform = "none";
    guideCard.style.left = `${next.left}px`;
    guideCard.style.top = `${next.top}px`;
    guideCard.style.right = "auto";
    guideCard.style.bottom = "auto";
    if (dragged) cardDragged = true;
  }

  function positionCard(placement, targetSelector) {
    if (!guideCard) return;
    if (cardDragged) {
      const left = Number.parseFloat(guideCard.style.left) || 0;
      const top = Number.parseFloat(guideCard.style.top) || 0;
      applyCardPosition(left, top, true);
      return;
    }
    guideCard.dataset.placement = placement || "center";
    if (!targetSelector || placement === "center") {
      guideCard.style.top = "50%";
      guideCard.style.left = "50%";
      guideCard.style.right = "auto";
      guideCard.style.bottom = "auto";
      guideCard.style.transform = "translate(-50%, -50%)";
      return;
    }
    const target = document.querySelector(targetSelector);
    if (!target) {
      guideCard.style.top = "50%";
      guideCard.style.left = "50%";
      guideCard.style.transform = "translate(-50%, -50%)";
      return;
    }
    const rect = target.getBoundingClientRect();
    const margin = 16;
    guideCard.style.transform = "none";
    if (placement === "right") {
      guideCard.style.top = `${Math.min(window.innerHeight - 40, Math.max(margin, rect.top))}px`;
      guideCard.style.left = `${Math.min(window.innerWidth - guideCard.offsetWidth - margin, rect.right + margin)}px`;
      guideCard.style.right = "auto";
      guideCard.style.bottom = "auto";
    } else if (placement === "left") {
      guideCard.style.top = `${Math.min(window.innerHeight - 40, Math.max(margin, rect.top))}px`;
      guideCard.style.left = `${Math.max(margin, rect.left - guideCard.offsetWidth - margin)}px`;
      guideCard.style.right = "auto";
      guideCard.style.bottom = "auto";
    } else if (placement === "bottom") {
      guideCard.style.top = `${Math.min(window.innerHeight - guideCard.offsetHeight - margin, rect.bottom + margin)}px`;
      guideCard.style.left = `${Math.min(window.innerWidth - guideCard.offsetWidth - margin, Math.max(margin, rect.left))}px`;
      guideCard.style.right = "auto";
      guideCard.style.bottom = "auto";
    } else {
      guideCard.style.top = "50%";
      guideCard.style.left = "50%";
      guideCard.style.transform = "translate(-50%, -50%)";
    }
  }

  function cleanupStep() {
    if (typeof stepContext.cleanup === "function") {
      stepContext.cleanup();
    }
    stepContext = {};
  }

  function isStepComplete(step) {
    if (!helpers) return false;
    const state = { ...helpers.getState(), ...stepContext };
    return step.validate(state, stepContext);
  }

  function refreshStepUi() {
    const step = getCurrentStep();
    if (!step) return;
    const done = isStepComplete(step);
    const isLast =
      chapterIndex === GUIDE_CHAPTERS.length - 1 && stepIndex === GUIDE_CHAPTERS[chapterIndex].steps.length - 1;
    nextBtn.disabled = !done;
    nextBtn.textContent = done ? (isLast ? "完成" : "下一步") : "请先完成操作";
    hintEl.textContent = done ? "已完成，可进入下一步。" : "请按说明完成当前操作。";
    hintEl.classList.toggle("done", done);
  }

  function startPoll() {
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(refreshStepUi, 200);
    refreshStepUi();
  }

  function enterStep(runPrepare = true) {
    cleanupStep();
    const step = getCurrentStep();
    if (!step) return;

    if (runPrepare && step.prepare) step.prepare(helpers);

    const chapter = GUIDE_CHAPTERS[chapterIndex];
    chapterEl.textContent = chapter.title;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;

    const flatIndex = currentFlatIndex() + 1;
    progressEl.textContent = `步骤 ${flatIndex} / ${totalSteps()}`;
    progressBarEl.style.width = `${(flatIndex / totalSteps()) * 100}%`;

    prevBtn.disabled = flatIndex <= 1;
    renderChapterList();

    if (step.onEnter) step.onEnter(stepContext, helpers);

    window.requestAnimationFrame(() => {
      scrollTargetIntoView(step.target);
      updateHighlight(step.target);
      positionCard(step.placement, step.target);
    });

    startPoll();
  }

  function goNext() {
    const chapter = GUIDE_CHAPTERS[chapterIndex];
    if (stepIndex < chapter.steps.length - 1) {
      stepIndex += 1;
      enterStep(true);
      return;
    }
    if (chapterIndex < GUIDE_CHAPTERS.length - 1) {
      chapterIndex += 1;
      stepIndex = 0;
      enterStep(true);
      return;
    }
    closeGuide(true);
  }

  function goPrev() {
    if (stepIndex > 0) {
      stepIndex -= 1;
      enterStep(false);
      return;
    }
    if (chapterIndex > 0) {
      chapterIndex -= 1;
      stepIndex = GUIDE_CHAPTERS[chapterIndex].steps.length - 1;
      enterStep(false);
    }
  }

  function openGuide() {
    if (!helpers || !root) return;
    active = true;
    chapterIndex = 0;
    stepIndex = 0;
    resetCardLayout();
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("guide-active");
    enterStep(true);
    Promise.resolve(helpers.prepareGuideSandbox?.()).finally(() => {
      if (!active) return;
      enterStep(false);
    });
  }

  function closeGuide(completed = false) {
    active = false;
    window.clearInterval(pollTimer);
    cleanupStep();
    resetCardLayout();
    clearHighlightTarget();
    root?.classList.add("hidden");
    root?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("guide-active");
    highlight?.classList.add("hidden");
    Promise.resolve(helpers?.prepareGuideSandbox?.()).finally(() => {
      if (completed && helpers?.showToast) helpers.showToast("交互式引导已完成");
    });
  }

  function bindCardDrag() {
    if (!guideCardHead || !guideCard) return;

    guideCardHead.addEventListener("pointerdown", (evt) => {
      if (evt.button !== 0 || evt.target.closest("button")) return;
      const rect = guideCard.getBoundingClientRect();
      dragState = {
        pointerId: evt.pointerId,
        offsetX: evt.clientX - rect.left,
        offsetY: evt.clientY - rect.top
      };
      guideCard.classList.add("dragging");
      guideCardHead.setPointerCapture(evt.pointerId);
      evt.preventDefault();
    });

    guideCardHead.addEventListener("pointermove", (evt) => {
      if (!dragState || dragState.pointerId !== evt.pointerId) return;
      applyCardPosition(evt.clientX - dragState.offsetX, evt.clientY - dragState.offsetY, true);
    });

    function endDrag(evt) {
      if (!dragState || dragState.pointerId !== evt.pointerId) return;
      dragState = null;
      guideCard.classList.remove("dragging");
      if (guideCardHead.hasPointerCapture(evt.pointerId)) {
        guideCardHead.releasePointerCapture(evt.pointerId);
      }
    }

    guideCardHead.addEventListener("pointerup", endDrag);
    guideCardHead.addEventListener("pointercancel", endDrag);
  }

  function onLayoutChange() {
    if (!active) return;
    const step = getCurrentStep();
    if (!step) return;
    updateHighlight(step.target);
    positionCard(step.placement, step.target);
  }

  function bindUi() {
    bindCardDrag();
    document.getElementById("helpBtn")?.addEventListener("click", () => openGuide());
    nextBtn?.addEventListener("click", () => {
      if (nextBtn.disabled) return;
      goNext();
    });
    prevBtn?.addEventListener("click", goPrev);
    exitBtn?.addEventListener("click", () => closeGuide(false));
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    document.addEventListener("keydown", (evt) => {
      if (!active) return;
      if (evt.key === "Escape") {
        evt.preventDefault();
        closeGuide(false);
      }
    });
  }

  window.initReportIndexGuide = function initReportIndexGuide(nextHelpers) {
    helpers = nextHelpers;
    bindUi();
  };

  window.openReportIndexGuide = function openReportIndexGuide() {
    openGuide();
  };

  window.isReportIndexGuideActive = function isReportIndexGuideActive() {
    return active;
  };
})();
