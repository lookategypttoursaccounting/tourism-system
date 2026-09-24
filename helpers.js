  function openTab(evt, tabId) {
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) {
      tabContents[i].classList.remove("active");
    }
    const tabBtns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabBtns.length; i++) {
      tabBtns[i].classList.remove("active");
    }
    document.getElementById(tabId).classList.add("active");
    evt.currentTarget.classList.add("active");
  }

  function openSubTab(evt, subTabId, parentTabId) {
    if (parentTabId) {
      const tabContents = document.getElementsByClassName("tab-content");
      for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
      }
      document.getElementById(parentTabId).classList.add("active");
    }

    const currentTab = document.getElementById(parentTabId) || evt.currentTarget.closest('.tab-content');
    const subContents = currentTab.getElementsByClassName("sub-tab-content");
    for (let i = 0; i < subContents.length; i++) {
      subContents[i].classList.remove("active");
    }

    const subBtns = evt.currentTarget.parentElement.getElementsByClassName("sub-tab-btn");
    for (let i = 0; i < subBtns.length; i++) {
      subBtns[i].classList.remove("active");
    }

    document.getElementById(subTabId).classList.add("active");
    evt.currentTarget.classList.add("active");
  }

  // ============================================================
  // قسم السياحة (Tourism) — بوابة الدخول والتنقل
  // ============================================================
  const TOURISM_DEFAULT_PIN = '1234';
  const ADMIN_DEFAULT_PIN = '2026@Look#1$';

  // ترحيل لمرة واحدة: مسح أي رمز إدارة قديم مخزّن حتى يعمل الرمز الجديد
  try {
    if (!localStorage.getItem('pin_migrated_v2')) {
      localStorage.removeItem('admin_pin');
      localStorage.setItem('pin_migrated_v2', '1');
    }
  } catch (e) { /* ignore */ }

  function getTourismPin() {
    return localStorage.getItem('tourism_pin') || TOURISM_DEFAULT_PIN;
  }

  function getAdminPin() {
    return localStorage.getItem('admin_pin') || ADMIN_DEFAULT_PIN;
  }

  // ===== شاشة الدخول (Role-based) =====
  let selectedLoginRole = null;

  // إعادة شاشة الدخول لحالتها الافتراضية: إخفاء حقل كلمة المرور وزر الدخول
  function resetLoginScreen() {
    selectedLoginRole = null;
    const a = document.getElementById('roleAdminBtn');
    const tr = document.getElementById('roleTourismBtn');
    if (a) a.classList.remove('active');
    if (tr) tr.classList.remove('active');
    const err = document.getElementById('loginError');
    if (err) err.style.display = 'none';
    const wrap = document.getElementById('loginPinWrap');
    if (wrap) wrap.style.display = 'none';
    const inp = document.getElementById('loginPinInput');
    if (inp) inp.value = '';
  }

  function selectLoginRole(role) {
    selectedLoginRole = role;
    const a = document.getElementById('roleAdminBtn');
    const tr = document.getElementById('roleTourismBtn');
    if (a) a.classList.toggle('active', role === 'admin');
    if (tr) tr.classList.toggle('active', role === 'tourism');
    const err = document.getElementById('loginError');
    if (err) err.style.display = 'none';
    const wrap = document.getElementById('loginPinWrap');
    const inp = document.getElementById('loginPinInput');

    if (role === 'admin') {
      // إظهار حقل كلمة المرور وزر الدخول فقط عند اختيار "الحسابات"
      if (wrap) wrap.style.display = 'block';
      if (inp) { inp.value = ''; inp.focus(); }
    } else {
      // قسم السياحة مفتوح بدون رقم سري -> إخفاء الحقل والدخول مباشرة
      if (wrap) wrap.style.display = 'none';
      if (inp) inp.value = '';
      sessionStorage.setItem('authRole', 'tourism');
      enterTourism();
    }
  }

  function showLoginError() {
    const err = document.getElementById('loginError');
    if (err) err.style.display = 'block';
    const inp = document.getElementById('loginPinInput');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  function submitLogin() {
    // قسم السياحة مفتوح بدون رقم سري
    if (selectedLoginRole === 'tourism') {
      sessionStorage.setItem('authRole', 'tourism');
      enterTourism();
      return;
    }
    const inp = document.getElementById('loginPinInput');
    const pin = (inp ? inp.value : '').trim();
    if (pin === getAdminPin()) {
      sessionStorage.setItem('authRole', 'admin');
      showAdminApp();
    } else showLoginError();
  }

  function showAdminApp() {
    const login = document.getElementById('loginScreen');
    const app = document.getElementById('appScreen');
    const tourism = document.getElementById('tourismScreen');
    if (login) login.style.display = 'none';
    if (tourism) tourism.style.display = 'none';
    if (app) app.style.display = 'block';
    window.scrollTo(0, 0);
  }

  function logout() {
    sessionStorage.removeItem('authRole');
    sessionStorage.removeItem('tourismMode');
    const login = document.getElementById('loginScreen');
    const app = document.getElementById('appScreen');
    const tourism = document.getElementById('tourismScreen');
    const tourismModal = document.getElementById('tourismEntityDetailsModal');
    if (tourismModal) tourismModal.style.display = 'none';
    if (app) app.style.display = 'none';
    if (tourism) tourism.style.display = 'none';
    if (login) login.style.display = 'flex';
    resetLoginScreen();
    window.scrollTo(0, 0);
  }

  // معاينة قسم السياحة من داخل واجهة الإدارة (بدون رمز، لأن المدير مسجّل دخول بالفعل)
  function previewTourism() {
    sessionStorage.setItem('tourismMode', '1');
    enterTourism();
  }

  function enterTourism() {
    sessionStorage.setItem('tourismMode', '1');
    const login = document.getElementById('loginScreen');
    const app = document.getElementById('appScreen');
    const tourism = document.getElementById('tourismScreen');
    const tourismModal = document.getElementById('tourismEntityDetailsModal');
    if (tourismModal) tourismModal.style.display = 'none';
    if (login) login.style.display = 'none';
    if (app) app.style.display = 'none';
    if (tourism) tourism.style.display = 'block';
    if (window.App && typeof App.refreshTourismView === 'function') App.refreshTourismView();
    window.scrollTo(0, 0);
  }

  function exitTourism() {
    const role = sessionStorage.getItem('authRole');
    sessionStorage.removeItem('tourismMode');
    const tourism = document.getElementById('tourismScreen');
    const tourismModal = document.getElementById('tourismEntityDetailsModal');
    if (tourismModal) tourismModal.style.display = 'none';
    if (tourism) tourism.style.display = 'none';
    if (role === 'admin') {
      // المدير كان في وضع المعاينة -> يرجع لواجهة الإدارة
      const app = document.getElementById('appScreen');
      if (app) app.style.display = 'block';
    } else {
      // موظف السياحة -> تسجيل خروج والعودة لشاشة الدخول
      logout();
      return;
    }
    window.scrollTo(0, 0);
  }

  function openTourismSubTab(evt, subTabId) {
    const container = document.getElementById('tourismScreen');
    if (!container) return;
    const contents = container.getElementsByClassName('tourism-subtab-content');
    for (let i = 0; i < contents.length; i++) contents[i].classList.remove('active');
    const btns = evt.currentTarget.parentElement.getElementsByClassName('sub-tab-btn');
    for (let i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    const target = document.getElementById(subTabId);
    if (target) target.classList.add('active');
    evt.currentTarget.classList.add('active');
  }

  function changeTourismPin() {
    const newPin = prompt(t('tourism_pin_prompt'), '');
    if (newPin === null) return;
    const trimmed = newPin.trim();
    if (trimmed.length < 4) {
      if (window.showToast) window.showToast(t('tourism_pin_invalid'), 'error'); else alert(t('tourism_pin_invalid'));
      return;
    }
    localStorage.setItem('tourism_pin', trimmed);
    if (window.showToast) window.showToast(t('tourism_pin_changed'), 'success'); else alert(t('tourism_pin_changed'));
  }

  function changeAdminPin() {
    const newPin = prompt(t('admin_pin_prompt'), '');
    if (newPin === null) return;
    const trimmed = newPin.trim();
    if (trimmed.length < 4) {
      if (window.showToast) window.showToast(t('tourism_pin_invalid'), 'error'); else alert(t('tourism_pin_invalid'));
      return;
    }
    localStorage.setItem('admin_pin', trimmed);
    if (window.showToast) window.showToast(t('admin_pin_changed'), 'success'); else alert(t('admin_pin_changed'));
  }

  function filterTourismTicketsBalanceTable() {
    const input = document.getElementById('searchTourismTicketsBalance');
    const filter = input ? input.value.toLowerCase() : '';
    document.querySelectorAll('#tourismTicketsBalanceTable tbody tr').forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? '' : 'none';
    });
  }

  function filterTourismEntitySummaryTable() {
    const input = document.getElementById('searchTourismEntitySummary');
    const filter = input ? input.value.toLowerCase() : '';
    document.querySelectorAll('#tourismEntitySummaryTable tbody tr').forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? '' : 'none';
    });
  }

  function printTourismDashboard() { window.print(); }

  function downloadTourismDashboardPDF() {
    const element = document.getElementById('printableTourismArea');
    if (!element) return;
    html2pdf().set({
      margin: 0.5, filename: 'Tourism_Credit_Dashboard.pdf',
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' },
      html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') }
    }).from(element).save();
  }

  // استرجاع حالة الدخول بعد إعادة تحميل الصفحة (مثلاً عند تغيير اللغة)
  document.addEventListener('DOMContentLoaded', function () {
    const role = sessionStorage.getItem('authRole');
    const login = document.getElementById('loginScreen');
    const app = document.getElementById('appScreen');
    const tourism = document.getElementById('tourismScreen');

    if (role === 'admin') {
      if (login) login.style.display = 'none';
      if (tourism) tourism.style.display = 'none';
      if (app) app.style.display = 'block';
    } else if (role === 'tourism') {
      if (login) login.style.display = 'none';
      if (app) app.style.display = 'none';
      if (tourism) tourism.style.display = 'block';
      if (window.App && typeof App.refreshTourismView === 'function') App.refreshTourismView();
    } else {
      // لا يوجد تسجيل دخول -> شاشة الدخول (حقل كلمة المرور مخفي حتى الضغط على "الحسابات")
      if (app) app.style.display = 'none';
      if (tourism) tourism.style.display = 'none';
      if (login) login.style.display = 'flex';
      resetLoginScreen();
    }
  });

  function toggleAccountsMenu(evt) {
    const menu = document.getElementById("accountsSubMenu");
    const isHidden = menu.style.display === "none" || menu.style.display === "";
    menu.style.display = isHidden ? "flex" : "none";
    document.getElementById("accountsArrowIcon").innerText = isHidden ? "▲" : "▼";
  }

  function toggleTaxDiscountMenu(evt) {
    const menu = document.getElementById("taxDiscountSubMenu");
    const isHidden = menu.style.display === "none" || menu.style.display === "";
    menu.style.display = isHidden ? "flex" : "none";
    document.getElementById("taxArrowIcon").innerText = isHidden ? "▲" : "▼";
    openTab(evt, "taxDiscountTab");
  }

  function toggleCreditMenu(evt) {
    const menu = document.getElementById("creditSubMenu");
    const isHidden = menu.style.display === "none" || menu.style.display === "";
    menu.style.display = isHidden ? "flex" : "none";
    document.getElementById("creditArrowIcon").innerText = isHidden ? "▲" : "▼";
    openTab(evt, "creditTab");
  }

  function toggleAviationMenu(evt) {
    const menu = document.getElementById("aviationSubMenu");
    const isHidden = menu.style.display === "none" || menu.style.display === "";
    menu.style.display = isHidden ? "flex" : "none";
    document.getElementById("aviationArrowIcon").innerText = isHidden ? "▲" : "▼";
    openTab(evt, "aviationTab");
  }

  function toggleTicketsMenu(evt) {
    const menu = document.getElementById("ticketsSubMenu");
    const isHidden = menu.style.display === "none" || menu.style.display === "";
    menu.style.display = isHidden ? "flex" : "none";
    document.getElementById("ticketsArrowIcon").innerText = isHidden ? "▲" : "▼";
    openTab(evt, "ticketsTab");
  }

  function toggleShopsMenu(evt) {
    const menu = document.getElementById("shopsSubMenu");
    const isHidden = menu.style.display === "none" || menu.style.display === "";
    menu.style.display = isHidden ? "flex" : "none";
    document.getElementById("shopsArrowIcon").innerText = isHidden ? "▲" : "▼";
    openTab(evt, "shopsTab");
  }

  function toggleSettlementMenu(evt) {
    const menu = document.getElementById("settlementSubMenu");
    const isHidden = menu.style.display === "none" || menu.style.display === "";
    menu.style.display = isHidden ? "flex" : "none";
    document.getElementById("settlementArrowIcon").innerText = isHidden ? "▲" : "▼";
    openTab(evt, "settlementTab");
  }

  function filterSuppliersTable() {
    const input = document.getElementById("searchSupplier");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#suppliersTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterCreditTable() {
    const input = document.getElementById("searchCredit");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#creditTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterEntitySummaryTable() {
    const input = document.getElementById("searchEntitySummary");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#entitySummaryTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterShopsTable() {
    const input = document.getElementById("searchShop");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#shopsTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterShopSummaryTable() {
    const input = document.getElementById("searchShopSummary");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#shopSummaryTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterShopDirectoryTable() {
    const input = document.getElementById("searchShopDirectory");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#shopDirectoryTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterAviationTable() {
    const input = document.getElementById("searchAviation");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#aviationTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterAviationCommissionTable() {
    const input = document.getElementById("searchAviationCommission");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#aviationCommissionTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterTicketsTable() {
    const guideInput = document.getElementById("searchTicketsGuide");
    const fileCodeInput = document.getElementById("searchTicketsFileCode");
    const guideFilter = guideInput ? guideInput.value.toLowerCase() : "";
    const fileCodeFilter = fileCodeInput ? fileCodeInput.value.toLowerCase() : "";

    const trs = document.querySelectorAll("#ticketsTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      // ترتيب الأعمدة: #(0) الحركة(1) رقم الملف(2) اسم المزار(3) المندوب/المرشد(4) ...
      const fileCodeText = (tr.children[2] ? tr.children[2].innerText : "").toLowerCase();
      const guideText = (tr.children[4] ? tr.children[4].innerText : "").toLowerCase();

      const matchesGuide = !guideFilter || guideText.includes(guideFilter);
      const matchesFileCode = !fileCodeFilter || fileCodeText.includes(fileCodeFilter);

      tr.style.display = (matchesGuide && matchesFileCode) ? "" : "none";
    });
  }

  function filterTicketsBalanceTable() {
    const input = document.getElementById("searchTicketsBalance");
    const filter = input ? input.value.toLowerCase() : "";
    const trs = document.querySelectorAll("#ticketsBalanceTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      tr.style.display = tr.innerText.toLowerCase().includes(filter) ? "" : "none";
    });
  }

  function filterSettlementsTable() {
    const input = document.getElementById("searchSettlements");
    const filter = input ? input.value.toLowerCase() : "";
    const select = document.getElementById("operatorFilterSelect");
    const selectedOperator = select ? select.value.toLowerCase().trim() : "";

    const printFilterElem = document.getElementById("settlementPrintFilter");
    if (printFilterElem) {
      printFilterElem.innerText = selectedOperator ? `${select.value}` : 'جميع الأوبريتورز';
    }

    const trs = document.querySelectorAll("#settlementsTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      const guideName = (tr.getAttribute("data-guide") || "").toLowerCase().trim();
      const textMatch = tr.innerText.toLowerCase().includes(filter);
      const operatorMatch = !selectedOperator || guideName === selectedOperator;

      tr.style.display = (textMatch && operatorMatch) ? "" : "none";
    });

    if (window.App && window.App.updateSettlementTotalCommission) {
      window.App.updateSettlementTotalCommission();
    }
  }

  function filterArchiveSettlementsTable() {
    const input = document.getElementById("searchArchiveSettlements");
    const filter = input ? input.value.toLowerCase() : "";
    const select = document.getElementById("archiveOperatorFilterSelect");
    const selectedOperator = select ? select.value.toLowerCase().trim() : "";

    const archivePrintFilterElem = document.getElementById("archiveSettlementPrintFilter");
    if (archivePrintFilterElem) {
      archivePrintFilterElem.innerText = selectedOperator ? `${select.value}` : 'جميع الأوبريتورز';
    }

    const trs = document.querySelectorAll("#settlementsArchiveTable tbody tr");
    trs.forEach(tr => {
      if (tr.children.length === 1) return;
      const guideName = (tr.getAttribute("data-guide") || "").toLowerCase().trim();
      const textMatch = tr.innerText.toLowerCase().includes(filter);
      const operatorMatch = !selectedOperator || guideName === selectedOperator;

      tr.style.display = (textMatch && operatorMatch) ? "" : "none";
    });

    if (window.App && window.App.updateArchiveSettlementTotalCommission) {
      window.App.updateArchiveSettlementTotalCommission();
    }
  }

  function printArchiveSettlementsList() { window.print(); }
  function downloadArchiveSettlementsPDF() {
    const element = document.getElementById('printableSettlementArchiveArea');
    const opt = {
      margin:       0.5,
      filename:     'Settlement_Archive_Report.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, ignoreElements: (el) => el.classList && el.classList.contains('no-print') },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
  }

  function printSuppliersList() { window.print(); }
  function downloadSuppliersPDF() {
    const element = document.getElementById('printableSuppliersArea');
    html2pdf().set({ margin: 0.5, filename: 'Suppliers_Report.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }, html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') } }).from(element).save();
  }
  function printDashboard() { window.print(); }
  function downloadDashboardPDF() {
    const element = document.getElementById('printableArea');
    html2pdf().set({ margin: 0.5, filename: 'Credit_Dashboard.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }, html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') } }).from(element).save();
  }
  function downloadShopsDashboardPDF() {
    const element = document.getElementById('printableShopsArea');
    html2pdf().set({ margin: 0.5, filename: 'Shops_Dashboard.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }, html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') } }).from(element).save();
  }
  function downloadMasterDashboardPDF() {
    const element = document.getElementById('printableMasterDashboard');
    html2pdf().set({ margin: 0.5, filename: 'Master_Dashboard.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }, html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') } }).from(element).save();
  }
  function downloadAviationPDF() {
    const element = document.getElementById('printableAviationArea');
    html2pdf().set({ margin: 0.5, filename: 'Aviation_Report.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }, html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') } }).from(element).save();
  }
  function downloadTicketsPDF() {
    const element = document.getElementById('printableTicketsArea');
    html2pdf().set({
      margin: 0.5, filename: 'Tickets_Report.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' },
      html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') }
    }).from(element).save();
  }
  function downloadTicketsBalancePDF() {
    const element = document.getElementById('printableTicketsBalanceArea');
    html2pdf().set({
      margin: 0.5, filename: 'Tickets_Balance_Report.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' },
      html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') }
    }).from(element).save();
  }
  function printSettlementsList() { window.print(); }
  function downloadSettlementsPDF() {
    const element = document.getElementById('printableSettlementArea');
    html2pdf().set({ margin: 0.5, filename: 'Settlements_Report.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }, html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') } }).from(element).save();
  }
  function downloadStatementPDF() {
    const element = document.getElementById('printableStatementArea');
    html2pdf().set({ margin: 0.5, filename: 'Account_Statement.pdf', jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }, html2canvas: { ignoreElements: (el) => el.classList && el.classList.contains('no-print') } }).from(element).save();
  }
  function exportStatementToExcel() {
    const table = document.getElementById('statementRunningTable');
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table, {sheet: "كشف الحساب"});
    XLSX.writeFile(wb, "Account_Statement.xlsx");
  }
  function resetStatementFilters() {
    document.getElementById('stEntityName').value = '';
    document.getElementById('stFileCode').value = '';
    document.getElementById('statementRunningTbody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">قم باختيار الفندق/الجهة والضغط على (🔍 بحث) لعرض كشف الحساب</td></tr>';
    const wrap = document.getElementById('statementResultsWrap');
    if (wrap) wrap.style.display = 'none';
  }
  // فتح/إغلاق قائمة البحث المنسدلة في صفحة كشف الحساب
  function toggleStatementSearchPanel() {
    const panel = document.getElementById('statementSearchPanel');
    if (!panel) return;
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      const inp = document.getElementById('stEntityName');
      if (inp) setTimeout(() => inp.focus(), 50);
    }
  }
  // تنفيذ البحث ثم إغلاق القائمة
  function runStatementSearch() {
    renderRunningStatement();
    const panel = document.getElementById('statementSearchPanel');
    if (panel) panel.style.display = 'none';
  }
  function searchStatementEntities() {
    const queryVal = document.getElementById('stEntityName').value.trim().toLowerCase();
    const dropdown = document.getElementById('stEntitySuggestions');
    if (!queryVal || !window.App) { dropdown.style.display = 'none'; return; }
    
    const matched = [...new Set(window.App.currentCredit.map(c => c.entity))]
      .filter(e => e && e.toLowerCase().includes(queryVal));

    if (matched.length === 0) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matched.map(m => `<div class="suggestion-item" onclick="selectStatementEntity('${escapeHTML(m)}')"><span>${escapeHTML(m)}</span></div>`).join('');
    dropdown.style.display = 'block';
  }
  function selectStatementEntity(name) {
    document.getElementById('stEntityName').value = name;
    document.getElementById('stEntitySuggestions').style.display = 'none';
  }
  function searchCreditEntitySuggestions() {
    const queryVal = document.getElementById('creditEntity').value.trim().toLowerCase();
    const dropdown = document.getElementById('creditEntitySuggestions');
    if (!queryVal || !window.App) { dropdown.style.display = 'none'; return; }

    // نبحث في أسماء الفنادق/الجهات المسجلة فعليًا في سجل عمليات الكريديت (أرصدة الكريديت)
    const matched = [...new Set(window.App.currentCredit.map(c => c.entity))]
      .filter(e => e && e.toLowerCase().includes(queryVal));

    if (matched.length === 0) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matched.map(m => `<div class="suggestion-item" onclick="selectCreditEntitySuggestion('${escapeHTML(m)}')"><span>${escapeHTML(m)}</span></div>`).join('');
    dropdown.style.display = 'block';
  }
  function selectCreditEntitySuggestion(name) {
    document.getElementById('creditEntity').value = name;
    document.getElementById('creditEntitySuggestions').style.display = 'none';
  }
  function searchShopEntitySuggestions() {
    const queryVal = document.getElementById('shopEntity').value.trim().toLowerCase();
    const dropdown = document.getElementById('shopEntitySuggestions');
    if (!queryVal || !window.App) { dropdown.style.display = 'none'; return; }

    // لو الاسم مطابق تمامًا لمحل في الدليل، نعبّي نسبة العمولة ونوع المحل تلقائيًا
    applyShopAutoFill(document.getElementById('shopEntity').value);

    // نبحث في المحلات المسجلة في دليل المحلات، وكمان في أسماء المحلات اللي ليها حركات سابقة
    const directoryMatches = (window.App.currentShopDirectory || [])
      .filter(s => (s.name || '').toLowerCase().includes(queryVal))
      .map(s => ({ name: s.name, extra: [s.region, s.type, s.commissionRate != null ? s.commissionRate + '%' : ''].filter(Boolean).join(' • ') }));

    const historyNames = new Set(directoryMatches.map(m => m.name));
    const historyMatches = [...new Set(window.App.currentShops.map(s => s.entity))]
      .filter(e => e && e.toLowerCase().includes(queryVal) && !historyNames.has(e))
      .map(e => ({ name: e, extra: '' }));

    const matched = [...directoryMatches, ...historyMatches];
    if (matched.length === 0) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matched.map(m => `
      <div class="suggestion-item" onclick="selectShopEntitySuggestion('${escapeHTML(m.name)}')">
        <span>${escapeHTML(m.name)}</span>
        ${m.extra ? `<span style="font-size:12px; color:#94a3b8;">${escapeHTML(m.extra)}</span>` : ''}
      </div>
    `).join('');
    dropdown.style.display = 'block';
  }
  function selectShopEntitySuggestion(name) {
    document.getElementById('shopEntity').value = name;
    document.getElementById('shopEntitySuggestions').style.display = 'none';
    applyShopAutoFill(name);
  }

  // تعبئة نسبة العمولة ونوع المحل تلقائيًا من دليل المحلات بمجرد اختيار/كتابة اسم المحل
  function applyShopAutoFill(name) {
    const commissionInput = document.getElementById('shopCommission');
    const typeInput = document.getElementById('shopShopType');
    const target = (name || '').trim().toLowerCase();
    const shop = (window.App && window.App.currentShopDirectory || [])
      .find(s => (s.name || '').trim().toLowerCase() === target);

    if (commissionInput) {
      commissionInput.value = (shop && shop.commissionRate != null) ? shop.commissionRate : '';
    }
    if (typeInput) {
      const shopType = (shop && shop.type) ? String(shop.type).trim() : '';
      let matchedValue = '';
      if (shopType) {
        const options = Array.from(typeInput.options);
        // 1) مطابقة مباشرة لقيمة الخيار
        const exact = options.find(o => o.value === shopType);
        if (exact) {
          matchedValue = exact.value;
        } else {
          // 2) مطابقة بعد التطبيع (تتعامل مع اختلاف ه/ة والمسافات)
          const normalize = s => String(s).replace(/[ةه]/g, 'ه').replace(/\s+/g, '').trim();
          const fuzzy = options.find(o => normalize(o.value) === normalize(shopType));
          matchedValue = fuzzy ? fuzzy.value : '';
        }
      }
      typeInput.value = matchedValue;
    }

    // مراعاة حالة قفل العمولة حسب نوع الحركة الحالي بعد التعبئة التلقائية
    onShopTypeChange();
  }

  // عند اختيار "دائن (المحصل)" يعني المبلغ محصّل بالكامل من المحل، فلا داعي لحساب عمولة
  // فيتم قفل خانة نسبة العمولة وتصفيرها. وعند الرجوع لـ "مدين (لنا)" تُعاد تفعيلها
  // وتُعاد تعبئتها تلقائيًا من دليل المحلات إن وُجد.
  function onShopTypeChange() {
    const typeSelect = document.getElementById('shopType');
    const commissionInput = document.getElementById('shopCommission');
    if (!typeSelect || !commissionInput) return;

    if (typeSelect.value === 'deduction') {
      commissionInput.value = '';
      commissionInput.disabled = true;
    } else {
      commissionInput.disabled = false;
      const entityName = document.getElementById('shopEntity') ? document.getElementById('shopEntity').value : '';
      const target = (entityName || '').trim().toLowerCase();
      const shop = (window.App && window.App.currentShopDirectory || [])
        .find(s => (s.name || '').trim().toLowerCase() === target);
      commissionInput.value = (shop && shop.commissionRate != null) ? shop.commissionRate : commissionInput.value;
    }
  }

  function renderRunningStatement() {
    const entity = document.getElementById('stEntityName').value.trim();
    const currency = document.getElementById('stCurrency').value;
    const fileCode = document.getElementById('stFileCode').value.trim().toLowerCase();

    if (!entity) { alert('يرجى اختيار اسم الجهة أو الفندق أولاً'); return; }

    const stWrap = document.getElementById('statementResultsWrap');
    if (stWrap) stWrap.style.display = 'block';

    document.getElementById('stInfoEntity').innerText = entity;
    document.getElementById('stInfoCurrency').innerText = currency;
    document.getElementById('pdfStatementSub').innerText = `اسم الجهة: ${entity} | العملة: ${currency}`;

    const records = (window.App ? window.App.currentCredit : []).filter(c => {
      if (c.isDeleted) return false;
      if (c.entity.trim().toLowerCase() !== entity.toLowerCase()) return false;
      if ((c.currency || 'EGP').toUpperCase() !== currency) return false;
      if (fileCode && !(c.fileCode || '').toLowerCase().includes(fileCode)) return false;
      return true;
    }).sort((a,b) => new Date(a.arrivalDate || 0) - new Date(b.arrivalDate || 0));

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let html = '';

    records.forEach((r) => {
      const amt = parseFloat(r.amount) || 0;
      const isDeposit = r.type === 'deposit';
      const debitVal = isDeposit ? amt : 0;
      const creditVal = !isDeposit ? amt : 0;

      totalDebit += debitVal;
      totalCredit += creditVal;
      runningBalance += (debitVal - creditVal);

      html += `
        <tr>
          <td>${formatDateDMY(r.arrivalDate)}</td>
          <td>${escapeHTML(r.description || r.fileCode || '-')}</td>
          <td style="color:#16a34a; font-weight:700;">${debitVal ? debitVal.toLocaleString() : '-'}</td>
          <td style="color:#dc2626; font-weight:700;">${creditVal ? creditVal.toLocaleString() : '-'}</td>
          <td style="color:#2563eb; font-weight:800;">${runningBalance.toLocaleString()}</td>
        </tr>
      `;
    });

    if (records.length === 0) {
      html = '<tr><td colspan="5" style="text-align:center; color:#64748b;">لا توجد حركات مطابقة للبحث</td></tr>';
    }

    document.getElementById('statementRunningTbody').innerHTML = html;
    document.getElementById('stCardDebit').innerText = totalDebit.toLocaleString();
    document.getElementById('stCardCredit').innerText = totalCredit.toLocaleString();
    document.getElementById('stCardBalance').innerText = runningBalance.toLocaleString();
    document.getElementById('stTotalCount').innerText = records.length;
  }

  function formatDateDMY(iso) {
    if (!iso) return '-';
    const parts = iso.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return iso;
  }

  function escapeHTML(str) {
    if (typeof str !== 'string') return str ?? '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
