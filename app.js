  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import { 
    getFirestore, collection, addDoc, updateDoc, doc, 
    onSnapshot, query, orderBy 
  } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
  import {
    getAuth, signInAnonymously, onAuthStateChanged
  } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

  const firebaseConfig = {
    apiKey: "AIzaSyBnVZaF4cbNqTM03tA3dWEfk2k3aWj0djs",
    authDomain: "tourism-management-syste-b0c23.firebaseapp.com",
    projectId: "tourism-management-syste-b0c23",
    storageBucket: "tourism-management-syste-b0c23.firebasestorage.app",
    messagingSenderId: "220547259810",
    appId: "1:220547259810:web:0857978bcab6ea93ff26fb"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  const deleteDocAsync = async (documentReference) => updateDoc(documentReference, {
    isDeleted: true,
    deletedAt: new Date()
  });

  const $ = (id) => document.getElementById(id);

  // قائمة المزارات الثابتة المستخدمة في صفحة إضافة تذكرة مزار
  const TICKET_ATTRACTIONS = [
    'الهرم', 'متحف كبير', 'سقاره', 'المتحف المصري', 'القلعه', 'دهشور',
    'معبد الاقصر', 'ادفو', 'وادي الملوك', 'حتشبسوت', 'الكرنك', 'فيله',
    'ابو سمبل', 'كوم امبو', 'عمود السواري', 'كتاكومب'
  ];

  const showToast = (message, type = 'info', duration = 3500) => {
    const container = document.getElementById('toastContainer') || (() => {
      const div = document.createElement('div'); div.id = 'toastContainer'; div.className = 'toast-container';
      document.body.appendChild(div); return div;
    })();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-30px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };

  // توحيد شكل النص العربي (إزالة التشكيل والتطويل والمسافات الزائدة، وتوحيد أشكال الألف/الياء/التاء المربوطة)
  // عشان مطابقة أسماء الأعمدة والقيم تنجح حتى لو فيه فروق بسيطة في الكتابة أو ترتيب مختلف للأعمدة
  const normalizeArabicText = (str) => {
    return String(str ?? '')
      .trim()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // إزالة التشكيل والتطويل
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  };

  // تحويل الأرقام العربية (٠-٩) والفاصلة العشرية/الآلاف لأرقام إنجليزية عادية قبل التحويل الرقمي
  const normalizeDigits = (value) => {
    if (value === null || value === undefined) return '';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    return String(value)
      .replace(/[٠-٩]/g, d => arabicDigits.indexOf(d))
      .replace(/,/g, '')
      .trim();
  };
  const parseFlexNumber = (value) => parseFloat(normalizeDigits(value)) || 0;
  const parseFlexInt = (value) => parseInt(normalizeDigits(value)) || 0;

  // يقرأ قيمة عمود من صف إكسيل بغض النظر عن ترتيب الأعمدة أو الفروق البسيطة في اسم العمود (مسافات/تشكيل/أ-إ-آ/ة-ه)
  const getRowValueFlexible = (row, candidateHeaders) => {
    const normalizedCandidates = candidateHeaders.map(normalizeArabicText);
    for (const key of Object.keys(row)) {
      if (normalizedCandidates.includes(normalizeArabicText(key))) return row[key];
    }
    return '';
  };

  // قراءة أول شيت من ملف إكسيل وتحويله لمصفوفة كائنات (كل عمود بعنوان الهيدر) — يعمل بغض النظر عن ترتيب الأعمدة
  const readExcelFileAsRows = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          resolve(rows);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('تعذرت قراءة الملف'));
      reader.readAsArrayBuffer(file);
    });
  };

  // استيراد صفوف من إكسيل إلى مجموعة في Firestore، مع دالة تحويل صف -> بيانات المستند (أو null لتجاهله)
  const bulkImportToCollection = async (rows, collectionName, rowMapper) => {
    let successCount = 0, skipCount = 0;
    for (const row of rows) {
      const mapped = rowMapper(row);
      if (!mapped) { skipCount++; continue; }
      await addDoc(collection(db, collectionName), mapped);
      successCount++;
    }
    return { successCount, skipCount, total: rows.length };
  };

  // تحويل قيمة تاريخ من إكسيل (رقم تسلسلي أو نص) إلى صيغة YYYY-MM-DD المطلوبة لحقل input[type=date]
  const excelDateToInputValue = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return '';
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${mm}-${dd}`;
    }
    const str = String(value).trim();
    // صيغة DD/MM/YYYY أو DD-MM-YYYY
    const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
    // صيغة YYYY-MM-DD جاهزة
    const m2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
    return '';
  };

  const App = {
    currentSuppliers: [],
    currentCredit: [],
    currentAviation: [],
    currentTickets: [],
    currentSettlements: [],
    currentShops: [],
    currentShopDirectory: [],

    init() {
      this.listenToSuppliers();
      this.listenToCredit();
      this.listenToAviation();
      this.listenToTickets();
      this.listenToSettlements();
      this.listenToShops();
      this.listenToShopDirectory();
      this.renderFixedTicketRows();
    },

    normalizeKey(value) {
      return String(value || '').trim().toUpperCase();
    },

    isDuplicate(records, field, value, excludeId = '') {
      const key = this.normalizeKey(value);
      return Boolean(key) && records.some(record => !record.isDeleted && record.id !== excludeId && this.normalizeKey(record[field]) === key);
    },

    calculateSettlementValues(revenueInput, expensesInput, exchangeRateInput) {
      const rawRevenue = parseFloat(revenueInput) || 0;
      const rawExpenses = parseFloat(expensesInput) || 0;
      const exchangeRate = parseFloat(exchangeRateInput) || 0;
      const rate = exchangeRate > 0 ? exchangeRate : 1;

      // تحويل الإيرادات والمصروفات للعملة الأخرى باستخدام سعر الصرف قبل حساب الربح والعمولة
      const revenue = rawRevenue * rate;
      const expenses = rawExpenses * rate;
      const profit = revenue - expenses;
      const netAfterTax = profit / 1.14;
      const commissionRate = 0.10;
      const commissionAmount = netAfterTax * commissionRate;

      return {
        rawRevenue,
        rawExpenses,
        exchangeRate: rate,
        revenue,
        expenses,
        profit,
        netAfterTax,
        commissionRate,
        commissionAmount
      };
    },

    // 1. SUPPLIERS
    listenToSuppliers() {
      const q = query(collection(db, "tax_discount_records"), orderBy("createdAt", "desc"));
      onSnapshot(q, (snapshot) => {
        const tbody = $('suppliersTableBody');
        this.currentSuppliers = [];
        if (snapshot.empty) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">${t('msg_no_data')}</td></tr>`;
          this.updateMasterDashboard();
          return;
        }

        let idx = 1;
        let htmlBuffer = '';
        snapshot.forEach(docSnap => {
          const data = docSnap.data(); data.id = docSnap.id;
          if (data.isDeleted) return;
          this.currentSuppliers.push(data);

          const typeBadge = data.supplierType === 'كروز' ? `<span class="badge badge-cruise">${t('opt_cruise')}</span>` :
                            data.supplierType === 'مطعم' ? `<span class="badge badge-restaurant">${t('opt_restaurant')}</span>` :
                            `<span class="badge badge-hotel">${t('opt_hotel')}</span>`;
          const taxBadge = (data.taxRate === 0.03 || data.taxRate === "0.03") ? `<span class="badge badge-taxable">${t('opt_taxed_3_short')}</span>` :
                           `<span class="badge badge-advance">${t('opt_advance_payment')}</span>`;
          const dateStr = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '-';

          htmlBuffer += `
            <tr>
              <td>${idx++}</td>
              <td>${typeBadge}</td>
              <td><strong>${escapeHTML(data.propertyName)}</strong></td>
              <td>${escapeHTML(data.supplierName)}</td>
              <td>${escapeHTML(data.taxCardNumber)}</td>
              <td>${taxBadge}</td>
              <td>${dateStr}</td>
              <td class="no-print">
                <button class="edit-btn" onclick="App.openEditModal('${docSnap.id}')">${t('btn_edit')}</button>
                <button class="delete-btn" onclick="App.deleteSupplier('${docSnap.id}')">${t('btn_delete')}</button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = htmlBuffer;
        this.updateMasterDashboard();
      });
    },

    async saveSupplier() {
      const supplierType = $('supplierType').value;
      const propertyName = $('propertyName').value.trim();
      const supplierName = $('supplierName').value.trim();
      const taxCardNumber = $('taxCardNumber').value.trim();
      const taxTypeVal = $('taxType').value;
      const taxRate = taxTypeVal === "0.03" ? 0.03 : taxTypeVal;

      if (!propertyName || !supplierName || !taxCardNumber) return showToast('يرجى ملء كافة البيانات', 'error');

      if (this.isDuplicate(this.currentSuppliers, 'taxCardNumber', taxCardNumber)) return showToast('يوجد مورد مسجل بنفس الرقم الضريبي', 'error');
      const btn = $('btnSaveSupplier');
      btn.disabled = true; btn.innerText = 'جاري الحفظ...';
      try {
        await addDoc(collection(db, "tax_discount_records"), { supplierType, propertyName, supplierName, taxCardNumber, taxRate, isDeleted: false, createdAt: new Date() });
        showToast('تم حفظ المورد بنجاح!', 'success');
        $('propertyName').value = ''; $('supplierName').value = ''; $('taxCardNumber').value = '';
      } catch (e) { showToast(e.message, 'error'); } 
      finally { btn.disabled = false; btn.innerText = 'حفظ البيانات'; }
    },

    async deleteSupplier(id) {
      if (!confirm('تأكيد حذف المورد؟')) return;
      try { await deleteDocAsync(doc(db, "tax_discount_records", id)); showToast('تم الحذف', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    openEditModal(id) {
      const item = this.currentSuppliers.find(s => s.id === id);
      if (!item) return;
      $('editSupplierId').value = id;
      $('editSupplierType').value = item.supplierType || 'فندق';
      $('editPropertyName').value = item.propertyName || '';
      $('editSupplierName').value = item.supplierName || '';
      $('editTaxCardNumber').value = item.taxCardNumber || '';
      $('editTaxType').value = (item.taxRate === 0.03 || item.taxRate === "0.03") ? "0.03" : "advance_payment";
      $('editSupplierModal').style.display = 'flex';
    },

    closeEditModal() { $('editSupplierModal').style.display = 'none'; },

    async saveEditedSupplier() {
      const id = $('editSupplierId').value;
      const supplierType = $('editSupplierType').value;
      const propertyName = $('editPropertyName').value.trim();
      const supplierName = $('editSupplierName').value.trim();
      const taxCardNumber = $('editTaxCardNumber').value.trim();
      const taxRate = $('editTaxType').value === "0.03" ? 0.03 : "advance_payment";
      if (!propertyName || !supplierName || !taxCardNumber) return showToast('يرجى ملء الحقول المطلوبة', 'error');
      if (this.isDuplicate(this.currentSuppliers, 'taxCardNumber', taxCardNumber, id)) return showToast('يوجد مورد مسجل بنفس الرقم الضريبي', 'error');
      try {
        await updateDoc(doc(db, "tax_discount_records", id), { supplierType, propertyName, supplierName, taxCardNumber, taxRate });
        showToast('تم التعديل بنجاح!', 'success');
        this.closeEditModal();
      } catch (e) { showToast(e.message, 'error'); }
    },

    exportSuppliersList() {
      if (this.currentSuppliers.length === 0) return showToast(t('msg_no_data_export'), 'error');
      const data = this.currentSuppliers.map((item, idx) => ({
        [t('col_idx')]: idx+1, [t('lbl_type')]: item.supplierType || 'فندق', [t('lbl_name')]: item.propertyName || '',
        [t('lbl_supplier')]: item.supplierName || '', [t('lbl_tax_number')]: item.taxCardNumber || '',
        [t('lbl_tax_status')]: (item.taxRate === 0.03 || item.taxRate === "0.03") ? t('opt_taxed_3_short') : t('opt_advance_payment')
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t('sheet_suppliers'));
      XLSX.writeFile(wb, "Suppliers_List.xlsx");
    },

    async importSuppliersFromExcel() {
      const input = $('supplierExcelFile');
      const file = input && input.files[0];
      if (!file) return showToast('يرجى اختيار ملف إكسيل أولاً', 'error');

      const btn = $('btnImportSuppliersExcel');
      btn.disabled = true; btn.innerText = 'جاري الاستيراد...';
      try {
        const rows = await readExcelFileAsRows(file);
        const result = await bulkImportToCollection(rows, 'tax_discount_records', (row) => {
          const propertyName = String(getRowValueFlexible(row, ['الاسم', 'اسم العقار', 'اسم الفندق']) ?? '').trim();
          const supplierName = String(getRowValueFlexible(row, ['المورد', 'اسم المورد']) ?? '').trim();
          const taxCardNumber = String(getRowValueFlexible(row, ['الرقم الضريبي', 'رقم البطاقة الضريبية', 'البطاقة الضريبية']) ?? '').trim();
          if (!propertyName || !supplierName || !taxCardNumber) return null;

          let supplierType = String(getRowValueFlexible(row, ['النوع', 'نوع المورد']) || 'فندق').trim();
          if (!['فندق', 'كروز', 'مطعم'].includes(supplierType)) supplierType = 'فندق';

          const taxStatusRaw = String(getRowValueFlexible(row, ['حالة الضريبة', 'الضريبة']) ?? '').trim();
          const taxRate = (taxStatusRaw.includes('3') || taxStatusRaw === '0.03') ? 0.03 : 'advance_payment';

          return { supplierType, propertyName, supplierName, taxCardNumber, taxRate, isDeleted: false, createdAt: new Date() };
        });
        showToast(`تم استيراد ${result.successCount} من ${result.total} سجل` + (result.skipCount ? ` (تم تجاهل ${result.skipCount} لعدم اكتمال البيانات)` : ''), 'success');
        input.value = '';
      } catch (e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; btn.innerText = '📥 اختيار ملف واستيراد'; }
    },

    // 2. CREDIT BALANCES
    listenToCredit() {
      const q = query(collection(db, "credit_balances"), orderBy("createdAt", "desc"));
      onSnapshot(q, (snapshot) => {
        const tbody = $('creditTableBody');
        this.currentCredit = [];
        if (snapshot.empty) {
          tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">لا توجد حركات مسجلة</td></tr>';
          this.updateMasterDashboard();
          return;
        }

        let idx = 1;
        let htmlBuffer = '';
        snapshot.forEach(docSnap => {
          const data = docSnap.data(); data.id = docSnap.id;
          if (data.isDeleted) return;
          this.currentCredit.push(data);

          const badge = data.type === 'deposit' ? '<span class="badge badge-deposit">مدين</span>' : '<span class="badge badge-deduction">دائن</span>';
          const dateStr = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '-';

          htmlBuffer += `
            <tr>
              <td>${idx++}</td>
              <td><strong>${escapeHTML(data.entity)}</strong></td>
              <td>${escapeHTML(data.fileCode || '-')}</td>
              <td>${formatDateDMY(data.arrivalDate)}</td>
              <td>${formatDateDMY(data.departureDate)}</td>
              <td>${badge}</td>
              <td style="font-weight:700;">${(parseFloat(data.amount)||0).toLocaleString()}</td>
              <td>${escapeHTML(data.currency || 'EGP')}</td>
              <td>${escapeHTML(data.description || '-')}</td>
              <td>${dateStr}</td>
              <td class="no-print">
                <button class="delete-btn" onclick="App.deleteCredit('${docSnap.id}')">حذف</button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = htmlBuffer;
        this.updateCreditDashboard();
        this.updateMasterDashboard();
      });
    },

    async saveCredit() {
      const entity = $('creditEntity').value.trim();
      const fileCode = $('creditFileCode').value.trim();
      const arrivalDate = $('creditArrivalDate').value;
      const departureDate = $('creditDepartureDate').value;
      const type = $('creditType').value;
      const amount = parseFloat($('creditAmount').value);
      const currency = $('creditCurrency').value;
      const description = $('creditDescription').value.trim();

      if (!entity || isNaN(amount) || amount <= 0) return showToast('يرجى ادخال الجهة والمبلغ بشكل صحيح', 'error');

      const btn = $('btnSaveCredit'); btn.disabled = true;
      try {
        await addDoc(collection(db, "credit_balances"), {
          entity, fileCode, arrivalDate, departureDate, type, amount, currency, description, isDeleted: false, createdAt: new Date()
        });
        showToast('تم تسجيل الحركة بنجاح', 'success');
        $('creditEntity').value = ''; $('creditFileCode').value = ''; $('creditAmount').value = ''; $('creditDescription').value = '';
      } catch (e) { showToast(e.message, 'error'); } 
      finally { btn.disabled = false; }
    },

    async deleteCredit(id) {
      if (!confirm('تأكيد حذف الحركة؟')) return;
      try { await deleteDocAsync(doc(db, "credit_balances", id)); showToast('تم الحذف', 'success'); } catch(e) { showToast(e.message, 'error'); }
    },

    exportCreditList() {
      if (this.currentCredit.length === 0) return showToast('لا توجد بيانات', 'error');
      const data = this.currentCredit.map((item, idx) => ({
        "م": idx+1, "الجهة": item.entity, "رقم الملف": item.fileCode, "الوصول": item.arrivalDate,
        "المغادرة": item.departureDate, "النوع": item.type === 'deposit' ? 'مدين' : 'دائن',
        "المبلغ": item.amount, "العملة": item.currency, "البيان": item.description
      }));
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الكريديت"); XLSX.writeFile(wb, "Credit_List.xlsx");
    },

    async importCreditFromExcel() {
      const input = $('creditExcelFile');
      const file = input && input.files[0];
      if (!file) return showToast('يرجى اختيار ملف إكسيل أولاً', 'error');

      const btn = $('btnImportCreditExcel');
      btn.disabled = true; btn.innerText = 'جاري الاستيراد...';
      try {
        const rows = await readExcelFileAsRows(file);
        const result = await bulkImportToCollection(rows, 'credit_balances', (row) => {
          const entity = String(getRowValueFlexible(row, ['الجهة', 'الفندق', 'اسم الجهة']) ?? '').trim();
          const amount = parseFlexNumber(getRowValueFlexible(row, ['المبلغ', 'القيمة']));
          if (!entity || amount <= 0) return null;

          const fileCode = String(getRowValueFlexible(row, ['رقم الملف', 'كود الملف']) ?? '').trim();
          const arrivalDate = excelDateToInputValue(getRowValueFlexible(row, ['الوصول', 'تاريخ الوصول']));
          const departureDate = excelDateToInputValue(getRowValueFlexible(row, ['المغادرة', 'تاريخ المغادرة']));
          const typeRaw = String(getRowValueFlexible(row, ['النوع', 'نوع الحركة']) ?? '').trim();
          const type = (normalizeArabicText(typeRaw) === normalizeArabicText('دائن') || typeRaw === 'deduction') ? 'deduction' : 'deposit';
          let currency = String(getRowValueFlexible(row, ['العملة']) || 'EGP').trim().toUpperCase();
          if (!['EGP', 'USD', 'EUR'].includes(currency)) currency = 'EGP';
          const description = String(getRowValueFlexible(row, ['البيان', 'الوصف', 'ملاحظات']) ?? '').trim();

          return { entity, fileCode, arrivalDate, departureDate, type, amount, currency, description, isDeleted: false, createdAt: new Date() };
        });
        showToast(`تم استيراد ${result.successCount} من ${result.total} سجل` + (result.skipCount ? ` (تم تجاهل ${result.skipCount} لعدم اكتمال البيانات)` : ''), 'success');
        input.value = '';
      } catch (e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; btn.innerText = '📥 اختيار ملف واستيراد'; }
    },

    updateCreditDashboard() {
      const byCurrencyDebit = {}, byCurrencyCredit = {};
      const grouped = {};

      this.currentCredit.forEach(c => {
        const amt = parseFloat(c.amount) || 0;
        const cur = (c.currency || 'EGP').toUpperCase();

        if (c.type === 'deposit') byCurrencyDebit[cur] = (byCurrencyDebit[cur] || 0) + amt;
        else byCurrencyCredit[cur] = (byCurrencyCredit[cur] || 0) + amt;

        const key = `${c.entity}_${cur}`;
        if (!grouped[key]) grouped[key] = { entity: c.entity, currency: cur, debit: 0, credit: 0 };
        if (c.type === 'deposit') grouped[key].debit += amt;
        else grouped[key].credit += amt;
      });

      // نعرض كل عملة ظهرت في المدين أو الدائن، حتى لو كان رصيدها صفر في الطرف الآخر
      const allCurrencies = Array.from(new Set([...Object.keys(byCurrencyDebit), ...Object.keys(byCurrencyCredit)]));

      const renderBreakdown = (elId, valuesMap) => {
        const el = $(elId);
        if (!el) return;
        if (allCurrencies.length === 0) { el.innerHTML = '0'; return; }
        el.innerHTML = allCurrencies.map(cur => {
          const val = valuesMap[cur] || 0;
          return `<div class="cur-row"><span class="cur-code">${cur}</span><span>${val.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>`;
        }).join('');
      };

      const netByCurrency = {};
      allCurrencies.forEach(cur => { netByCurrency[cur] = (byCurrencyDebit[cur] || 0) - (byCurrencyCredit[cur] || 0); });

      renderBreakdown('dashTotalDeposits', byCurrencyDebit);
      renderBreakdown('dashTotalDeductions', byCurrencyCredit);
      renderBreakdown('dashNetBalance', netByCurrency);

      const tbody = $('entitySummaryTableBody');
      let html = '', idx = 1;
      Object.values(grouped).forEach(g => {
        const net = g.debit - g.credit;
        const statusBadge = net >= 0 ? '<span class="badge badge-deposit">له (مدين)</span>' : '<span class="badge badge-deduction">عليه (دائن)</span>';
        html += `
          <tr>
            <td>${idx++}</td>
            <td><strong>${escapeHTML(g.entity)}</strong></td>
            <td>${g.currency}</td>
            <td style="color:#16a34a; font-weight:700;">${g.debit.toLocaleString()}</td>
            <td style="color:#dc2626; font-weight:700;">${g.credit.toLocaleString()}</td>
            <td style="font-weight:800;">${net.toLocaleString()}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;">لا توجد بيانات</td></tr>';

      // تحديث نسخة قسم السياحة (إن وُجدت)
      this.updateTourismCreditDashboard();
    },

    // ===== قسم السياحة: الملخص والداش بورد (الكريديت) =====
    updateTourismCreditDashboard() {
      const byCurrencyDebit = {}, byCurrencyCredit = {};
      const grouped = {};

      this.currentCredit.forEach(c => {
        const amt = parseFloat(c.amount) || 0;
        const cur = (c.currency || 'EGP').toUpperCase();

        if (c.type === 'deposit') byCurrencyDebit[cur] = (byCurrencyDebit[cur] || 0) + amt;
        else byCurrencyCredit[cur] = (byCurrencyCredit[cur] || 0) + amt;

        const key = `${c.entity}_${cur}`;
        if (!grouped[key]) grouped[key] = { entity: c.entity, currency: cur, debit: 0, credit: 0 };
        if (c.type === 'deposit') grouped[key].debit += amt;
        else grouped[key].credit += amt;
      });

      const allCurrencies = Array.from(new Set([...Object.keys(byCurrencyDebit), ...Object.keys(byCurrencyCredit)]));

      const renderBreakdown = (elId, valuesMap) => {
        const el = $(elId);
        if (!el) return;
        if (allCurrencies.length === 0) { el.innerHTML = '0'; return; }
        el.innerHTML = allCurrencies.map(cur => {
          const val = valuesMap[cur] || 0;
          return `<div class="cur-row"><span class="cur-code">${cur}</span><span>${val.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>`;
        }).join('');
      };

      const netByCurrency = {};
      allCurrencies.forEach(cur => { netByCurrency[cur] = (byCurrencyDebit[cur] || 0) - (byCurrencyCredit[cur] || 0); });

      renderBreakdown('tourismDashTotalDeposits', byCurrencyDebit);
      renderBreakdown('tourismDashTotalDeductions', byCurrencyCredit);
      renderBreakdown('tourismDashNetBalance', netByCurrency);

      const tbody = $('tourismEntitySummaryTableBody');
      if (!tbody) return;
      let html = '', idx = 1;
      Object.values(grouped).forEach(g => {
        const net = g.debit - g.credit;
        const statusBadge = net >= 0 ? '<span class="badge badge-deposit">له (مدين)</span>' : '<span class="badge badge-deduction">عليه (دائن)</span>';
        html += `
          <tr>
            <td>${idx++}</td>
            <td><strong class="entity-link" data-entity="${escapeHTML(g.entity)}" data-currency="${g.currency}" onclick="App.openTourismEntityDetails(this)" title="اضغط لعرض تفاصيل الحركة">${escapeHTML(g.entity)}</strong></td>
            <td>${g.currency}</td>
            <td style="color:#16a34a; font-weight:700;">${g.debit.toLocaleString()}</td>
            <td style="color:#dc2626; font-weight:700;">${g.credit.toLocaleString()}</td>
            <td style="font-weight:800;">${net.toLocaleString()}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;">لا توجد بيانات</td></tr>';
    },

    // ===== قسم السياحة: عرض تفاصيل حركة حساب جهة معينة (فندق / كروز) =====
    openTourismEntityDetails(el) {
      if (!el) return;
      const entity = el.getAttribute('data-entity') || '';
      const currency = el.getAttribute('data-currency') || '';
      const modal = $('tourismEntityDetailsModal');
      const title = $('tourismEntityDetailsTitle');
      const summary = $('tourismEntityDetailsSummary');
      const tbody = $('tourismEntityDetailsTableBody');
      if (!modal || !tbody) return;

      // فلترة الحركات الخاصة بالجهة والعملة المحددتين
      const rows = this.currentCredit.filter(c =>
        (c.entity || '') === entity &&
        ((c.currency || 'EGP').toUpperCase()) === currency
      );

      let debit = 0, credit = 0;
      rows.forEach(c => {
        const amt = parseFloat(c.amount) || 0;
        if (c.type === 'deposit') debit += amt; else credit += amt;
      });
      const net = debit - credit;

      if (title) title.textContent = `تفاصيل حركة الحساب — ${entity} (${currency})`;

      if (summary) {
        summary.innerHTML = `
          <div class="dash-card" style="border-right:4px solid #16a34a;background:#f0fdf4;flex:1;min-width:150px;">
            <span class="dash-card-title" style="color:#166534;">إجمالي المدين</span>
            <div class="dash-card-value" style="color:#15803d;font-size:20px;">${debit.toLocaleString()}</div>
          </div>
          <div class="dash-card" style="border-right:4px solid #dc2626;background:#fef2f2;flex:1;min-width:150px;">
            <span class="dash-card-title" style="color:#991b1b;">إجمالي الدائن</span>
            <div class="dash-card-value" style="color:#b91c1c;font-size:20px;">${credit.toLocaleString()}</div>
          </div>
          <div class="dash-card" style="border-right:4px solid #0284c7;background:#f0f9ff;flex:1;min-width:150px;">
            <span class="dash-card-title" style="color:#075985;">صافي الرصيد</span>
            <div class="dash-card-value" style="color:#0369a1;font-size:20px;">${net.toLocaleString()}</div>
          </div>
        `;
      }

      let html = '', i = 1;
      rows.forEach(c => {
        const badge = c.type === 'deposit'
          ? '<span class="badge badge-deposit">مدين</span>'
          : '<span class="badge badge-deduction">دائن</span>';
        const dateStr = c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '-';
        html += `
          <tr>
            <td>${i++}</td>
            <td>${escapeHTML(c.fileCode || '-')}</td>
            <td>${formatDateDMY(c.arrivalDate)}</td>
            <td>${formatDateDMY(c.departureDate)}</td>
            <td>${badge}</td>
            <td style="font-weight:700;">${(parseFloat(c.amount) || 0).toLocaleString()}</td>
            <td>${escapeHTML(c.currency || 'EGP')}</td>
            <td>${escapeHTML(c.description || '-')}</td>
            <td>${dateStr}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html || '<tr><td colspan="9" style="text-align:center;">لا توجد حركات لهذه الجهة</td></tr>';

      modal.style.display = 'flex';
    },

    closeTourismEntityDetails() {
      const modal = $('tourismEntityDetailsModal');
      if (modal) modal.style.display = 'none';
    },

    // تحديث كل شاشات قسم السياحة دفعة واحدة
    refreshTourismView() {
      this.updateTourismTicketsBalance();
      this.updateTourismCreditDashboard();
    },

    // 2.5. SHOPS (المحلات)
    listenToShops() {
      const q = query(collection(db, "shop_balances"), orderBy("createdAt", "desc"));
      onSnapshot(q, (snapshot) => {
        const tbody = $('shopsTableBody');
        this.currentShops = [];
        if (snapshot.empty) {
          tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;">${t('msg_no_shop_transactions')}</td></tr>`;
          this.updateShopsDashboard();
          this.updateMasterDashboard();
          return;
        }

        let idx = 1;
        let htmlBuffer = '';
        snapshot.forEach(docSnap => {
          const data = docSnap.data(); data.id = docSnap.id;
          if (data.isDeleted) return;
          this.currentShops.push(data);

          const badge = data.type === 'deposit' ? `<span class="badge badge-deposit">${t('opt_debit_short')}</span>` : `<span class="badge badge-deduction">${t('opt_credit_short')}</span>`;
          const dateStr = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '-';

          const amountVal = parseFloat(data.amount) || 0;
          const commissionPct = (data.commission != null && data.commission !== '') ? parseFloat(data.commission) : null;
          const commissionAmount = commissionPct != null ? (amountVal * commissionPct / 100) : null;
          const statusBadge = data.type === 'deposit'
            ? `<span class="badge badge-advance">${t('status_under_collection')}</span>`
            : `<span class="badge badge-deposit">${t('status_collected')}</span>`;

          htmlBuffer += `
            <tr>
              <td>${idx++}</td>
              <td><strong>${escapeHTML(data.entity)}</strong></td>
              <td>${escapeHTML(data.guideName || '-')}</td>
              <td>${escapeHTML(data.shopType || '-')}</td>
              <td>${escapeHTML(data.fileCode || '-')}</td>
              <td>${escapeHTML(data.month || '-')}</td>
              <td>${badge}</td>
              <td style="font-weight:700;">${amountVal.toLocaleString()}</td>
              <td>${escapeHTML(data.currency || 'EGP')}</td>
              <td>${commissionPct != null ? commissionPct + '%' : '-'}</td>
              <td style="font-weight:700; color:#7c3aed;">${commissionAmount != null ? commissionAmount.toLocaleString(undefined, {maximumFractionDigits: 2}) : '-'}</td>
              <td>${statusBadge}</td>
              <td>${escapeHTML(data.description || '-')}</td>
              <td>${dateStr}</td>
              <td class="no-print">
                <button class="delete-btn" onclick="App.deleteShop('${docSnap.id}')">${t('btn_delete')}</button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = htmlBuffer;
        this.updateShopsDashboard();
        this.updateMasterDashboard();
      });
    },

    async saveShop() {
      const entity = $('shopEntity').value.trim();
      const guideName = $('shopGuideName').value.trim();
      const shopType = $('shopShopType').value;
      const fileCode = $('shopFileCode').value.trim();
      const period = $('shopPeriod').value;
      const type = $('shopType').value;
      const amount = parseFloat($('shopAmount').value);
      const currency = $('shopCurrency').value;
      const commissionRaw = $('shopCommission').value;
      // في حالة "دائن (المحصل)" المبلغ محصل بالكامل من المحل فلا تُحتسب عمولة
      const commission = (type === 'deduction' || commissionRaw === '') ? null : parseFloat(commissionRaw);
      const description = $('shopDescription').value.trim();

      if (!entity || isNaN(amount) || amount <= 0) return showToast(t('msg_enter_shop_amount'), 'error');

      const btn = $('btnSaveShop'); btn.disabled = true;
      try {
        await addDoc(collection(db, "shop_balances"), {
          entity, guideName, shopType, fileCode, period, type, amount, currency, commission, description, isDeleted: false, createdAt: new Date()
        });
        showToast(t('msg_transaction_saved'), 'success');
        $('shopEntity').value = ''; $('shopGuideName').value = ''; $('shopShopType').value = ''; $('shopFileCode').value = ''; $('shopPeriod').selectedIndex = 0; $('shopAmount').value = ''; $('shopCommission').value = ''; $('shopDescription').value = '';
      } catch (e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; }
    },

    async deleteShop(id) {
      if (!confirm(t('confirm_delete_transaction'))) return;
      try { await deleteDocAsync(doc(db, "shop_balances", id)); showToast(t('msg_deleted'), 'success'); } catch(e) { showToast(e.message, 'error'); }
    },

    exportShopsList() {
      if (this.currentShops.length === 0) return showToast(t('msg_no_data_export'), 'error');
      const data = this.currentShops.map((item, idx) => {
        const amountVal = parseFloat(item.amount) || 0;
        const commissionPct = (item.commission != null && item.commission !== '') ? parseFloat(item.commission) : null;
        const commissionAmount = commissionPct != null ? (amountVal * commissionPct / 100) : '';
        return {
          [t('col_idx')]: idx+1, [t('lbl_shop')]: item.entity, [t('lbl_guide_name')]: item.guideName || '',
          [t('lbl_shop_type')]: item.shopType || '',
          [t('lbl_file_code')]: item.fileCode || '',
          [t('lbl_period')]: item.period || item.month || '',
          [t('lbl_type')]: item.type === 'deposit' ? t('opt_debit_short') : t('opt_credit_short'),
          [t('lbl_amount')]: item.amount, [t('lbl_currency')]: item.currency,
          [t('lbl_commission')]: commissionPct != null ? commissionPct + '%' : '',
          [t('lbl_commission_amount')]: commissionAmount,
          [t('lbl_status')]: item.type === 'deposit' ? t('status_under_collection') : t('status_collected'),
          [t('lbl_description')]: item.description
        };
      });
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('sheet_shops')); XLSX.writeFile(wb, "Shops_List.xlsx");
    },

    updateShopsDashboard() {
      const byCurrencyDebit = {}, byCurrencyCredit = {};
      const grouped = {};

      this.currentShops.forEach(s => {
        const amt = parseFloat(s.amount) || 0;
        const cur = (s.currency || 'EGP').toUpperCase();
        // إجمالي المدين = مبلغ العمولة المستحقة (المبلغ × نسبة العمولة) للحركات المدينة فقط
        const commissionPct = (s.commission != null && s.commission !== '') ? parseFloat(s.commission) : null;
        const commissionAmount = (s.type === 'deposit' && commissionPct != null) ? (amt * commissionPct / 100) : 0;

        if (s.type === 'deposit') byCurrencyDebit[cur] = (byCurrencyDebit[cur] || 0) + commissionAmount;
        else byCurrencyCredit[cur] = (byCurrencyCredit[cur] || 0) + amt;

        const key = `${s.entity}_${cur}`;
        if (!grouped[key]) grouped[key] = { entity: s.entity, currency: cur, debit: 0, credit: 0 };
        if (s.type === 'deposit') grouped[key].debit += commissionAmount;
        else grouped[key].credit += amt;
      });

      const allCurrencies = Array.from(new Set([...Object.keys(byCurrencyDebit), ...Object.keys(byCurrencyCredit)]));

      const renderBreakdown = (elId, valuesMap) => {
        const el = $(elId);
        if (!el) return;
        if (allCurrencies.length === 0) { el.innerHTML = '0'; return; }
        el.innerHTML = allCurrencies.map(cur => {
          const val = valuesMap[cur] || 0;
          return `<div class="cur-row"><span class="cur-code">${cur}</span><span>${val.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>`;
        }).join('');
      };

      const netByCurrency = {};
      allCurrencies.forEach(cur => { netByCurrency[cur] = (byCurrencyDebit[cur] || 0) - (byCurrencyCredit[cur] || 0); });

      renderBreakdown('shopDashTotalDeposits', byCurrencyDebit);
      renderBreakdown('shopDashTotalDeductions', byCurrencyCredit);
      renderBreakdown('shopDashNetBalance', netByCurrency);

      const tbody = $('shopSummaryTableBody');
      if (!tbody) return;
      let html = '', idx = 1;
      Object.values(grouped).forEach(g => {
        const net = g.debit - g.credit;
        const statusBadge = net >= 0 ? `<span class="badge badge-deposit">${t('status_owed_to_us')}</span>` : `<span class="badge badge-deduction">${t('status_owed_by_us')}</span>`;
        html += `
          <tr>
            <td>${idx++}</td>
            <td><strong>${escapeHTML(g.entity)}</strong></td>
            <td>${g.currency}</td>
            <td style="color:#16a34a; font-weight:700;">${g.debit.toLocaleString()}</td>
            <td style="color:#dc2626; font-weight:700;">${g.credit.toLocaleString()}</td>
            <td style="font-weight:800;">${net.toLocaleString()}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html || `<tr><td colspan="7" style="text-align:center;">${t('msg_no_data')}</td></tr>`;
    },

    // دليل المحلات (Shop Directory) - بيانات ثابتة لكل محل: الاسم، المنطقة، النوع، العمولة
    listenToShopDirectory() {
      const q = query(collection(db, "shop_directory"), orderBy("createdAt", "desc"));
      onSnapshot(q, (snapshot) => {
        const tbody = $('shopDirectoryTableBody');
        this.currentShopDirectory = [];
        if (!tbody) return;
        if (snapshot.empty) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${t('msg_no_data')}</td></tr>`;
          return;
        }

        let idx = 1;
        let htmlBuffer = '';
        snapshot.forEach(docSnap => {
          const data = docSnap.data(); data.id = docSnap.id;
          if (data.isDeleted) return;
          this.currentShopDirectory.push(data);

          htmlBuffer += `
            <tr>
              <td>${idx++}</td>
              <td><strong>${escapeHTML(data.name)}</strong></td>
              <td>${escapeHTML(data.region || '-')}</td>
              <td>${escapeHTML(data.type || '-')}</td>
              <td>${data.commissionRate != null ? data.commissionRate + '%' : '-'}</td>
              <td class="no-print">
                <button class="edit-btn" onclick="App.openShopDirectoryEditModal('${docSnap.id}')">${t('btn_edit')}</button>
                <button class="delete-btn" onclick="App.deleteShopDirectory('${docSnap.id}')">${t('btn_delete')}</button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = htmlBuffer;
      });
    },

    async saveShopDirectory() {
      const name = $('shopDirName').value.trim();
      const region = $('shopDirRegion').value;
      const type = $('shopDirType').value;
      const commissionRate = parseFloat($('shopDirCommission').value);

      if (!name) return showToast(t('msg_enter_shop_name'), 'error');
      if (this.isDuplicate(this.currentShopDirectory, 'name', name)) return showToast(t('msg_duplicate_shop'), 'error');

      const btn = $('btnSaveShopDirectory'); btn.disabled = true;
      try {
        await addDoc(collection(db, "shop_directory"), {
          name, region, type, commissionRate: isNaN(commissionRate) ? null : commissionRate, isDeleted: false, createdAt: new Date()
        });
        showToast(t('msg_shop_saved'), 'success');
        $('shopDirName').value = ''; $('shopDirCommission').value = '';
      } catch (e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; }
    },

    async deleteShopDirectory(id) {
      if (!confirm(t('confirm_delete_shop'))) return;
      try { await deleteDocAsync(doc(db, "shop_directory", id)); showToast(t('msg_deleted'), 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    openShopDirectoryEditModal(id) {
      const item = this.currentShopDirectory.find(s => s.id === id);
      if (!item) return;
      $('editShopDirId').value = id;
      $('editShopDirName').value = item.name || '';
      $('editShopDirRegion').value = item.region || 'الجيزة';
      $('editShopDirType').value = item.type || 'بردي';
      $('editShopDirCommission').value = (item.commissionRate != null) ? item.commissionRate : '';
      $('editShopDirectoryModal').style.display = 'flex';
    },

    closeShopDirectoryEditModal() { $('editShopDirectoryModal').style.display = 'none'; },

    async saveEditedShopDirectory() {
      const id = $('editShopDirId').value;
      const name = $('editShopDirName').value.trim();
      const region = $('editShopDirRegion').value;
      const type = $('editShopDirType').value;
      const commissionRate = parseFloat($('editShopDirCommission').value);

      if (!name) return showToast(t('msg_enter_shop_name'), 'error');
      if (this.isDuplicate(this.currentShopDirectory, 'name', name, id)) return showToast(t('msg_duplicate_shop'), 'error');
      try {
        await updateDoc(doc(db, "shop_directory", id), { name, region, type, commissionRate: isNaN(commissionRate) ? null : commissionRate });
        showToast(t('msg_edit_saved'), 'success');
        this.closeShopDirectoryEditModal();
      } catch (e) { showToast(e.message, 'error'); }
    },

    exportShopDirectoryList() {
      if (this.currentShopDirectory.length === 0) return showToast(t('msg_no_data_export'), 'error');
      const data = this.currentShopDirectory.map((item, idx) => ({
        [t('col_idx')]: idx+1, [t('lbl_shop_name')]: item.name, [t('lbl_region')]: item.region || '',
        [t('lbl_shop_type')]: item.type || '', [t('lbl_commission')]: item.commissionRate != null ? item.commissionRate + '%' : ''
      }));
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('sheet_shop_directory')); XLSX.writeFile(wb, "Shop_Directory.xlsx");
    },

    // استيراد القائمة الأساسية للمحلات (27 محل)؛ يتجاهل أي محل موجود بالفعل بنفس الاسم لتجنب التكرار
    async seedDefaultShops() {
      const defaultShops = [
        { name: "محل ميرت بردي", region: "الجيزة", type: "بردي", commissionRate: 40 },
        { name: "ميرت بازار +طبيعه للاقطان", region: "الجيزة", type: "بازار", commissionRate: 20 },
        { name: "طيبة قطن وريحة - ساره", region: "مصر القديمة", type: "قطن", commissionRate: 20 },
        { name: "محل جولدن ايجل ريحة", region: "الجيزة", type: "ريحة", commissionRate: 40 },
        { name: "بازار جولدن ايجل بردي", region: "الجيزة", type: "بردي", commissionRate: 20 },
        { name: "محل فانوس للاقطان", region: "الجيزة", type: "قطن", commissionRate: 20 },
        { name: "مملوك بازار", region: "مصر القديمة", type: "بازار", commissionRate: 20 },
        { name: "محل فايد اسوان ريحة", region: "أسوان", type: "ريحة", commissionRate: 40 },
        { name: "محل فايد الأقصر ريحة", region: "الأقصر", type: "ريحة", commissionRate: 40 },
        { name: "محل حابي للالباستر حجر", region: "الأقصر", type: "حجر", commissionRate: 35 },
        { name: "يو سكاراب", region: "أسوان", type: "بازار", commissionRate: 25 },
        { name: "إيجيبتيوس - الهرم", region: "الجيزة", type: "بردي", commissionRate: 35 },
        { name: "محل 3 بيراميدز", region: "الجيزة", type: "بردي", commissionRate: 35 },
        { name: "مصر للسجاد", region: "الجيزة", type: "سجاد", commissionRate: 20 },
        { name: "اورينتال", region: "الجيزة", type: "سجاد", commissionRate: 20 },
        { name: "كيفي برفان اسوان", region: "أسوان", type: "ريحة", commissionRate: 35 },
        { name: "كيفي برفان الأقصر", region: "الأقصر", type: "ريحة", commissionRate: 35 },
        { name: "إيجيبتيوس - الأقصر", region: "الأقصر", type: "بازار", commissionRate: 35 },
        { name: "كيفي برفان الهرم", region: "الجيزة", type: "ريحة", commissionRate: 35 },
        { name: "نفرتاري - طارق", region: "الجيزة", type: "قطن", commissionRate: 33 },
        { name: "جوهر - الأقصر", region: "الأقصر", type: "بازار", commissionRate: 25 },
        { name: "اختفون كاربت", region: "الجيزة", type: "سجاد", commissionRate: 20 },
        { name: "فيله - بازار ذهب", region: "الجيزة", type: "ريحة", commissionRate: 40 },
        { name: "تحمس الاباستر", region: "الأقصر", type: "حجر", commissionRate: 35 },
        { name: "حسابي الاباستر اسوان", region: "الأقصر", type: "حجر", commissionRate: 35 },
        { name: "مدرسة النيل للسجاد", region: "الجيزة", type: "سجاد", commissionRate: 20 },
        { name: "رويال مصر القديمة للعطور", region: "مصر القديمة", type: "ريحة", commissionRate: 35 }
      ];

      const btn = $('btnSeedShops'); btn.disabled = true; btn.innerText = t('msg_importing');
      try {
        let addedCount = 0, skippedCount = 0;
        for (const shop of defaultShops) {
          if (this.isDuplicate(this.currentShopDirectory, 'name', shop.name)) { skippedCount++; continue; }
          await addDoc(collection(db, "shop_directory"), { ...shop, isDeleted: false, createdAt: new Date() });
          addedCount++;
        }
        showToast(`${t('msg_seed_result')}: ${addedCount} ${t('msg_added')}, ${skippedCount} ${t('msg_skipped_duplicate')}`, 'success');
      } catch (e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; btn.innerText = t('btn_seed_shops'); }
    },

    // 3. AVIATION
    listenToAviation() {
      const q = query(collection(db, "aviation_records"), orderBy("createdAt", "desc"));
      onSnapshot(q, (snapshot) => {
        const tbody = $('aviationTableBody');
        this.currentAviation = [];
        if (snapshot.empty) {
          tbody.innerHTML = '<tr><td colspan="18" style="text-align:center;">لا توجد حجوزات مسجلة</td></tr>';
          this.renderAviationCommissionTable();
          this.updateMasterDashboard();
          return;
        }

        let idx = 1;
        let htmlBuffer = '';
        snapshot.forEach(docSnap => {
          const data = docSnap.data(); data.id = docSnap.id;
          if (data.isDeleted) return;
          this.currentAviation.push(data);

          const dateStr = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '-';
          const issueDateStr = data.issueDate ? new Date(data.issueDate).toLocaleDateString('en-GB') : '-';
          const typeBadge = data.transactionType === 'رد' ? '<span class="badge badge-deduction">رد</span>' : data.transactionType === 'VOID' ? '<span class="badge badge-void">VOID</span>' : '<span class="badge badge-deposit">بيع</span>';

          const passengersCount = parseFloat(data.passengersCount) || 0;
          const hasSelling = data.sellingPrice != null && data.sellingPrice !== '';
          const totalSelling = hasSelling ? passengersCount * (parseFloat(data.sellingPrice) || 0) : null;
          const totalActual = passengersCount * (parseFloat(data.ticketCost) || 0);

          htmlBuffer += `
            <tr>
              <td>${idx++}</td>
              <td>${typeBadge}</td>
              <td><strong>${escapeHTML(data.airlineName)}</strong></td>
              <td>${escapeHTML(data.pnrNumber)}</td>
              <td>${escapeHTML(data.ticketNumber || '-')}</td>
              <td>${escapeHTML(data.passengerName)}</td>
              <td>${escapeHTML(data.fileCode || '-')}</td>
              <td>${issueDateStr}</td>
              <td>${escapeHTML(data.operatorName || '-')}</td>
              <td>${data.passengersCount || '-'}</td>
              <td>${hasSelling ? (parseFloat(data.sellingPrice)||0).toLocaleString() : '-'}</td>
              <td>${hasSelling ? escapeHTML(data.sellingCurrency || 'USD') : '-'}</td>
              <td style="font-weight:700; color:#0369a1;">${totalSelling != null ? totalSelling.toLocaleString() : '-'}</td>
              <td>${(parseFloat(data.ticketCost)||0).toLocaleString()}</td>
              <td>${escapeHTML(data.currency || 'USD')}</td>
              <td style="font-weight:700; color:#7c3aed;">${totalActual.toLocaleString()}</td>
              <td>${dateStr}</td>
              <td class="no-print">
                <button class="edit-btn" onclick="App.openAviationEditModal('${docSnap.id}')">تعديل</button>
                <button class="delete-btn" onclick="App.deleteAviation('${docSnap.id}')">حذف</button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = htmlBuffer;
        this.renderAviationCommissionTable();
        this.updateMasterDashboard();
      });
    },

    // حساب صافي الربح لحجز طيران واحد (إجمالي سعر البيع - إجمالي القيمة الفعلية)
    calcAviationNetProfit(item) {
      const passengersCount = parseFloat(item.passengersCount) || 0;
      const hasSelling = item.sellingPrice != null && item.sellingPrice !== '';
      const totalSelling = hasSelling ? passengersCount * (parseFloat(item.sellingPrice) || 0) : 0;
      const totalActual = passengersCount * (parseFloat(item.ticketCost) || 0);
      return { totalSelling, totalActual, netProfit: totalSelling - totalActual };
    },

    // نسبة العمولة الثابتة المطبقة في صفحة العمولة
    AVIATION_COMMISSION_RATE: 40,

    // يرجع فقط عمليات البيع أو الرد اللي كلمة "cash" موجودة في رقم الملف بتاعها
    getCashAviationRecords() {
      return this.currentAviation.filter(item => (item.fileCode || '').toLowerCase().includes('cash'));
    },

    renderAviationCommissionTable() {
      const tbody = $('aviationCommissionTableBody');
      if (!tbody) return;

      const cashRecords = this.getCashAviationRecords();
      if (cashRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">لا توجد عمليات كاش مطابقة (تحتوي على "cash" في رقم الملف)</td></tr>';
        return;
      }

      let idx = 1;
      tbody.innerHTML = cashRecords.map(item => {
        const { totalSelling, totalActual, netProfit } = this.calcAviationNetProfit(item);
        const commissionAmount = netProfit * (this.AVIATION_COMMISSION_RATE / 100);
        const typeBadge = item.transactionType === 'رد' ? '<span class="badge badge-deduction">رد</span>' : item.transactionType === 'VOID' ? '<span class="badge badge-void">VOID</span>' : '<span class="badge badge-deposit">بيع</span>';
        const profitColor = netProfit < 0 ? '#dc2626' : '#15803d';

        return `
          <tr>
            <td>${idx++}</td>
            <td>${typeBadge}</td>
            <td><strong>${escapeHTML(item.airlineName)}</strong></td>
            <td>${escapeHTML(item.fileCode || '-')}</td>
            <td>${totalSelling.toLocaleString()}</td>
            <td>${totalActual.toLocaleString()}</td>
            <td style="font-weight:700; color:${profitColor};">${netProfit.toLocaleString()}</td>
            <td>${this.AVIATION_COMMISSION_RATE}%</td>
            <td style="font-weight:700; color:#16a34a;">${commissionAmount.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
          </tr>
        `;
      }).join('');
    },

    exportAviationCommissionList() {
      const cashRecords = this.getCashAviationRecords();
      if (cashRecords.length === 0) return showToast('لا توجد عمليات كاش مطابقة', 'error');

      const data = cashRecords.map((item, idx) => {
        const { totalSelling, totalActual, netProfit } = this.calcAviationNetProfit(item);
        const commissionAmount = netProfit * (this.AVIATION_COMMISSION_RATE / 100);
        return {
          "م": idx+1, "نوع العملية": item.transactionType || 'بيع', "شركة الطيران": item.airlineName, "رقم الملف": item.fileCode,
          "إجمالي سعر البيع": totalSelling, "إجمالي القيمة الفعلية": totalActual, "صافي الربح": netProfit,
          "نسبة العمولة": this.AVIATION_COMMISSION_RATE + '%', "قيمة العمولة": commissionAmount
        };
      });
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "عمولة الطيران"); XLSX.writeFile(wb, "Aviation_Commission.xlsx");
    },

    async saveAviation() {
      const transactionType = $('aviationTransactionType').value;
      const airlineName = $('airlineName').value.trim();
      const pnrNumber = $('pnrNumber').value.trim();
      const ticketNumber = $('aviationTicketNumber').value.trim();
      const passengerName = $('passengerName').value.trim();
      const fileCode = $('aviationFileCode').value.trim();
      const issueDate = $('aviationIssueDate').value;
      const operatorName = $('aviationOperator').value.trim();
      const passengersCount = parseInt($('aviationPassengersCount').value) || 0;
      const sellingPriceRaw = $('aviationSellingPrice').value;
      const sellingPrice = sellingPriceRaw === '' ? null : parseFloat(sellingPriceRaw);
      const sellingCurrency = 'EGP';
      const ticketCost = parseFloat($('ticketCost').value);
      const currency = 'EGP';
      const notes = $('aviationNotes').value.trim();

      if (!airlineName || !pnrNumber || isNaN(ticketCost)) return showToast('يرجى ملء الحقول الأساسية', 'error');

      const btn = $('btnSaveAviation'); btn.disabled = true;
      try {
        await addDoc(collection(db, "aviation_records"), {
          transactionType, airlineName, pnrNumber, ticketNumber, passengerName, fileCode,
          issueDate, operatorName, passengersCount, sellingPrice, sellingCurrency,
          ticketCost, currency, notes, isDeleted: false, createdAt: new Date()
        });
        showToast('تم حفظ حجز الطيران بنجاح', 'success');
        $('airlineName').value = ''; $('pnrNumber').value = ''; $('aviationTicketNumber').value = '';
        $('passengerName').value = ''; $('aviationFileCode').value = ''; $('aviationIssueDate').value = '';
        $('aviationOperator').value = ''; $('aviationPassengersCount').value = '';
        $('aviationSellingPrice').value = ''; $('ticketCost').value = ''; $('aviationNotes').value = '';
        $('aviationTransactionType').value = 'بيع';
      } catch (e) { showToast(e.message, 'error'); } 
      finally { btn.disabled = false; }
    },

    async deleteAviation(id) {
      if (!confirm('تأكيد حذف الحجز؟')) return;
      try { await deleteDocAsync(doc(db, "aviation_records", id)); showToast('تم الحذف', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    openAviationEditModal(id) {
      const item = this.currentAviation.find(a => a.id === id);
      if (!item) return;
      $('editAviationId').value = id;
      $('editAviationTransactionType').value = item.transactionType || 'بيع';
      $('editAirlineName').value = item.airlineName || '';
      $('editPnrNumber').value = item.pnrNumber || '';
      $('editAviationTicketNumber').value = item.ticketNumber || '';
      $('editPassengerName').value = item.passengerName || '';
      $('editAviationFileCode').value = item.fileCode || '';
      $('editAviationIssueDate').value = item.issueDate || '';
      $('editAviationOperator').value = item.operatorName || '';
      $('editAviationPassengersCount').value = item.passengersCount || '';
      $('editAviationSellingPrice').value = (item.sellingPrice != null) ? item.sellingPrice : '';
      $('editTicketCost').value = item.ticketCost || '';
      $('editAviationNotes').value = item.notes || '';
      $('editAviationModal').style.display = 'flex';
    },

    closeAviationEditModal() { $('editAviationModal').style.display = 'none'; },

    async saveEditedAviation() {
      const id = $('editAviationId').value;
      const transactionType = $('editAviationTransactionType').value;
      const airlineName = $('editAirlineName').value.trim();
      const pnrNumber = $('editPnrNumber').value.trim();
      const ticketNumber = $('editAviationTicketNumber').value.trim();
      const passengerName = $('editPassengerName').value.trim();
      const fileCode = $('editAviationFileCode').value.trim();
      const issueDate = $('editAviationIssueDate').value;
      const operatorName = $('editAviationOperator').value.trim();
      const passengersCount = parseInt($('editAviationPassengersCount').value) || 0;
      const sellingPriceRaw = $('editAviationSellingPrice').value;
      const sellingPrice = sellingPriceRaw === '' ? null : parseFloat(sellingPriceRaw);
      const sellingCurrency = 'EGP';
      const ticketCost = parseFloat($('editTicketCost').value);
      const currency = 'EGP';
      const notes = $('editAviationNotes').value.trim();

      if (!airlineName || !pnrNumber || isNaN(ticketCost)) return showToast('يرجى ملء الحقول المطلوبة', 'error');
      try {
        await updateDoc(doc(db, "aviation_records", id), {
          transactionType, airlineName, pnrNumber, ticketNumber, passengerName, fileCode,
          issueDate, operatorName, passengersCount, sellingPrice, sellingCurrency, ticketCost, currency, notes
        });
        showToast('تم تعديل حجز الطيران', 'success');
        this.closeAviationEditModal();
      } catch (e) { showToast(e.message, 'error'); }
    },

    exportAviationList() {
      if (this.currentAviation.length === 0) return showToast('لا توجد بيانات', 'error');
      const data = this.currentAviation.map((item, idx) => {
        const passengersCount = parseFloat(item.passengersCount) || 0;
        const hasSelling = item.sellingPrice != null && item.sellingPrice !== '';
        const totalSelling = hasSelling ? passengersCount * (parseFloat(item.sellingPrice) || 0) : '';
        const totalActual = passengersCount * (parseFloat(item.ticketCost) || 0);
        return {
          "م": idx+1, "نوع العملية": item.transactionType || 'بيع', "شركة الطيران": item.airlineName, "PNR": item.pnrNumber,
          "رقم التذكرة": item.ticketNumber || '', "المسافر": item.passengerName, "رقم الملف": item.fileCode,
          "تاريخ الإصدار": item.issueDate || '', "الأوبريتور": item.operatorName || '', "عدد الأفراد": item.passengersCount || '',
          "سعر البيع": hasSelling ? item.sellingPrice : '', "عملة البيع": hasSelling ? (item.sellingCurrency || '') : '',
          "إجمالي سعر البيع": totalSelling,
          "القيمة الفعلية": item.ticketCost, "العملة": item.currency,
          "إجمالي القيمة الفعلية": totalActual,
          "ملاحظات": item.notes || ''
        };
      });
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الطيران"); XLSX.writeFile(wb, "Aviation_List.xlsx");
    },

    // 4. TICKETS
    listenToTickets() {
      const q = query(collection(db, "ticket_records"), orderBy("createdAt", "desc"));
      onSnapshot(q, (snapshot) => {
        const tbody = $('ticketsTableBody');
        this.currentTickets = [];
        if (snapshot.empty) {
          tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">لا توجد تذاكر مسجلة</td></tr>';
          this.updateTicketsBalance();
          this.updateMasterDashboard();
          return;
        }

        let idx = 1;
        let htmlBuffer = '';
        snapshot.forEach(docSnap => {
          const data = docSnap.data(); data.id = docSnap.id;
          if (data.isDeleted) return;
          this.currentTickets.push(data);

          const dateStr = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '-';
          const actionBadge = data.action === 'صرف' ? '<span class="badge badge-deduction">صرف</span>' : '<span class="badge badge-deposit">إضافة</span>';

          let expiryStr = '-';
          if (data.expiryDate) {
            const expiryDateObj = new Date(data.expiryDate);
            const isExpired = expiryDateObj < new Date(new Date().toDateString());
            expiryStr = `<span style="${isExpired ? 'color:#dc2626; font-weight:700;' : ''}">${expiryDateObj.toLocaleDateString('en-GB')}</span>`;
          }

          htmlBuffer += `
            <tr>
              <td>${idx++}</td>
              <td>${actionBadge}</td>
              <td><strong>${escapeHTML(data.fileCode || '-')}</strong></td>
              <td>${escapeHTML(data.ticketName || '-')}</td>
              <td>${escapeHTML(data.guideName || '-')}</td>
              <td>${data.qty}</td>
              <td>${expiryStr}</td>
              <td>${escapeHTML(data.notes || '-')}</td>
              <td>${dateStr}</td>
              <td class="no-print">
                <button class="edit-btn" onclick="App.openTicketEditModal('${docSnap.id}')">تعديل</button>
                <button class="delete-btn" onclick="App.deleteTicket('${docSnap.id}')">حذف</button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = htmlBuffer;
        this.updateTicketsBalance();
        this.updateMasterDashboard();
      });
    },

    renderFixedTicketRows() {
      const tbody = $('ticketItemsTableBody');
      tbody.innerHTML = '';
      TICKET_ATTRACTIONS.forEach(attraction => {
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.textContent = attraction;
        nameTd.className = 'ticket-row-name';
        nameTd.dataset.name = attraction;

        const qtyTd = document.createElement('td');
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number'; qtyInput.className = 'ticket-row-qty';
        qtyInput.placeholder = '0'; qtyInput.min = '0';
        qtyTd.appendChild(qtyInput);

        const expiryTd = document.createElement('td');
        const expiryInput = document.createElement('input');
        expiryInput.type = 'date'; expiryInput.className = 'ticket-row-expiry';
        expiryTd.appendChild(expiryInput);

        tr.appendChild(nameTd); tr.appendChild(qtyTd); tr.appendChild(expiryTd);
        tbody.appendChild(tr);
      });
    },

    resetTicketForm() {
      $('ticketActionShared').value = 'اضافة';
      $('ticketFileCodeShared').value = '';
      $('ticketGuideShared').value = '';
      $('ticketNotesShared').value = '';
      this.renderFixedTicketRows();
    },

    async saveTicket() {
      const action = $('ticketActionShared').value;
      const fileCode = $('ticketFileCodeShared').value.trim();
      const guideName = $('ticketGuideShared').value.trim();
      const notes = $('ticketNotesShared').value.trim();

      if (action === 'صرف' && !fileCode) return showToast('يرجى إدخال رقم الملف في حالة الصرف', 'error');

      const rows = document.querySelectorAll('#ticketItemsTableBody tr');
      const validRows = [];
      rows.forEach(tr => {
        const ticketName = tr.querySelector('.ticket-row-name').dataset.name;
        const qty = parseInt(tr.querySelector('.ticket-row-qty').value) || 0;
        const expiryDate = tr.querySelector('.ticket-row-expiry').value;
        if (qty > 0) validRows.push({ ticketName, qty, expiryDate });
      });

      if (validRows.length === 0) return showToast('يرجى إدخال كمية صحيحة لمزار واحد على الأقل', 'error');

      const btn = $('btnSaveTicket'); btn.disabled = true;
      try {
        for (let row of validRows) {
          await addDoc(collection(db, "ticket_records"), {
            action, fileCode, ticketName: row.ticketName, guideName, qty: row.qty, expiryDate: row.expiryDate, notes, isDeleted: false, createdAt: new Date()
          });
        }
        showToast('تم حفظ التذاكر بنجاح', 'success');
        if (action === 'صرف') this.printTicketReceipt({ fileCode, guideName, notes, rows: validRows });
        this.resetTicketForm();
      } catch (e) { showToast(e.message, 'error'); } 
      finally { btn.disabled = false; }
    },

    // بناء إيصال صرف تذاكر وطباعته فورًا، مع سطر توقيع للشخص المستلم
    printTicketReceipt({ fileCode, guideName, notes, rows }) {
      const todayStr = new Date().toLocaleDateString('en-GB');
      const rowsHtml = rows.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHTML(r.ticketName)}</td>
          <td>${r.qty}</td>
        </tr>
      `).join('');
      const totalQty = rows.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0);

      const receiptHtml = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>إيصال صرف تذاكر</title>
          <style>
            body { font-family: Arial, Tahoma, sans-serif; padding: 30px; color: #111; }
            .report-header { text-align: center; margin-bottom: 25px; }
            .report-header h2 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
            .report-header p { font-size: 13px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            td, th { padding: 8px 10px; text-align: right; }
            .info-table td { padding: 6px 10px; }
            .items-table, .items-table th, .items-table td { border: 1px solid #333; }
            .items-table th { background: #f1f5f9; }
            .signatures { margin-top: 70px; display: flex; justify-content: space-between; font-size: 15px; }
          </style>
        </head>
        <body>
          <div class="report-header">
            <h2>إيصال صرف تذاكر مزارات</h2>
            <p>منظومة الحسابات السياحية</p>
          </div>
          <table class="info-table">
            <tr><td style="font-weight:700;">رقم الملف:</td><td>${escapeHTML(fileCode || '-')}</td>
                <td style="font-weight:700;">التاريخ:</td><td>${todayStr}</td></tr>
            <tr><td style="font-weight:700;">اسم المندوب / المرشد:</td><td colspan="3">${escapeHTML(guideName || '-')}</td></tr>
            ${notes ? `<tr><td style="font-weight:700;">ملاحظات:</td><td colspan="3">${escapeHTML(notes)}</td></tr>` : ''}
          </table>
          <table class="items-table">
            <thead>
              <tr><th>#</th><th>اسم المزار / الفعالية</th><th>الكمية المصروفة</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr><td style="font-weight:700;" colspan="2">الإجمالي</td><td style="font-weight:700;">${totalQty}</td></tr>
            </tfoot>
          </table>
          <div class="signatures">
            <div>توقيع المُسلِّم: ____________________</div>
            <div>توقيع المستلم: ____________________</div>
          </div>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank', 'width=800,height=900');
      if (!printWindow) { showToast('يرجى السماح بالنوافذ المنبثقة (Popups) لطباعة الإيصال', 'error'); return; }
      printWindow.document.open();
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    },

    // يطابق اسم مزار جاي من ملف إكسيل مع القائمة الثابتة، بمطابقة تامة أولاً وبعدين مطابقة جزئية (احتواء) كحل احتياطي
    matchAttractionName(rawName) {
      const norm = normalizeArabicText(rawName);
      if (!norm) return null;
      let found = TICKET_ATTRACTIONS.find(a => normalizeArabicText(a) === norm);
      if (found) return found;
      found = TICKET_ATTRACTIONS.find(a => norm.includes(normalizeArabicText(a)) || normalizeArabicText(a).includes(norm));
      return found || null;
    },

    async importTicketRowsFromExcel() {
      const input = $('ticketExcelFile');
      const file = input && input.files[0];
      if (!file) return showToast('يرجى اختيار ملف إكسيل أولاً', 'error');

      const btn = $('btnImportTicketsExcel');
      btn.disabled = true; btn.innerText = 'جاري الاستيراد...';
      try {
        const rows = await readExcelFileAsRows(file);
        let matchedCount = 0, skipCount = 0;

        rows.forEach(row => {
          const rawName = getRowValueFlexible(row, ['اسم المزار', 'المزار', 'اسم المزار والفعالية', 'الفعالية', 'اسم الفعالية']);
          const qty = parseFlexInt(getRowValueFlexible(row, ['الكمية', 'العدد', 'الكميه']));
          const ticketName = this.matchAttractionName(rawName);
          if (!ticketName || qty <= 0) { skipCount++; return; }

          const targetRow = Array.from(document.querySelectorAll('#ticketItemsTableBody tr'))
            .find(tr => tr.querySelector('.ticket-row-name').dataset.name === ticketName);

          if (!targetRow) { skipCount++; return; }
          targetRow.querySelector('.ticket-row-qty').value = qty;
          matchedCount++;
        });

        showToast(`تم تعبئة كمية ${matchedCount} مزار من الملف` + (skipCount ? ` (تم تجاهل ${skipCount} صف لعدم مطابقة اسم المزار أو نقص البيانات)` : '') + ' — راجع البيانات ثم اضغط حفظ', 'success');
        input.value = '';
      } catch (e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; btn.innerText = '📥 اختيار ملف واستيراد'; }
    },

    async deleteTicket(id) {
      if (!confirm('تأكيد حذف التذكرة؟')) return;
      try { await deleteDocAsync(doc(db, "ticket_records", id)); showToast('تم الحذف', 'success'); } catch (e) { showToast(e.message, 'error'); }
    },

    openTicketEditModal(id) {
      const item = this.currentTickets.find(t => t.id === id);
      if (!item) return;
      $('editTicketId').value = id;
      $('editTicketAction').value = item.action || 'اضافة';
      $('editTicketFileCode').value = item.fileCode || '';

      // نبني قائمة المزارات في الدروب داون، ونضيف اسم المزار الحالي كخيار إضافي لو مش موجود أصلاً في القائمة الثابتة
      const nameSelect = $('editTicketName');
      nameSelect.innerHTML = '';
      const currentName = item.ticketName || '';
      const options = TICKET_ATTRACTIONS.includes(currentName) || !currentName
        ? TICKET_ATTRACTIONS
        : [currentName, ...TICKET_ATTRACTIONS];
      options.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        nameSelect.appendChild(opt);
      });
      nameSelect.value = currentName || TICKET_ATTRACTIONS[0];

      $('editTicketGuide').value = item.guideName || '';
      $('editTicketQty').value = item.qty || '';
      $('editTicketExpiry').value = item.expiryDate || '';
      $('editTicketNotes').value = item.notes || '';
      $('editTicketModal').style.display = 'flex';
    },

    closeTicketEditModal() { $('editTicketModal').style.display = 'none'; },

    async saveEditedTicket() {
      const id = $('editTicketId').value;
      const action = $('editTicketAction').value;
      const fileCode = $('editTicketFileCode').value.trim();
      const ticketName = $('editTicketName').value;
      const guideName = $('editTicketGuide').value.trim();
      const qty = parseInt($('editTicketQty').value) || 0;
      const expiryDate = $('editTicketExpiry').value;
      const notes = $('editTicketNotes').value.trim();

      if (action === 'صرف' && !fileCode) return showToast('يرجى إدخال رقم الملف في حالة الصرف', 'error');
      if (qty <= 0) return showToast('يرجى إدخال كمية صحيحة', 'error');
      try {
        await updateDoc(doc(db, "ticket_records", id), { action, fileCode, ticketName, guideName, qty, expiryDate, notes });
        showToast('تم تعديل التذكرة بنجاح', 'success');
        this.closeTicketEditModal();
      } catch(e) { showToast(e.message, 'error'); }
    },

    exportTicketsList() {
      if (this.currentTickets.length === 0) return showToast('لا توجد بيانات', 'error');
      const data = this.currentTickets.map((item, idx) => ({
        "م": idx+1, "الحركة": item.action, "رقم الملف": item.fileCode, "اسم المزار": item.ticketName,
        "المندوب/المرشد": item.guideName, "الكمية": item.qty,
        "تاريخ الصلاحية": item.expiryDate || '',
        "الملاحظات": item.notes
      }));
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "التذاكر"); XLSX.writeFile(wb, "Tickets_List.xlsx");
    },

    updateTicketsBalance() {
      const tbody = $('ticketsBalanceTableBody');
      if (!tbody) return;

      const today = new Date(new Date().toDateString());
      const grouped = {};
      this.currentTickets.forEach(t => {
        const name = (t.ticketName || '').trim() || 'بدون اسم مزار';
        if (!grouped[name]) grouped[name] = { added: 0, deducted: 0, expired: 0 };
        const qty = parseFloat(t.qty) || 0;
        if (t.action === 'صرف') {
          grouped[name].deducted += qty;
        } else {
          grouped[name].added += qty;
          // نحسب الكمية منتهية الصلاحية من دفعات الإضافة اللي فات تاريخ صلاحيتها فقط
          if (t.expiryDate) {
            const expiryDateObj = new Date(t.expiryDate);
            if (expiryDateObj < today) grouped[name].expired += qty;
          }
        }
      });

      const names = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ar'));
      if (names.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد بيانات</td></tr>';
        return;
      }

      let idx = 1;
      tbody.innerHTML = names.map(name => {
        const g = grouped[name];
        const balance = g.added - g.deducted - g.expired;
        const balanceColor = balance < 0 ? '#dc2626' : (balance === 0 ? '#64748b' : '#15803d');
        return `
          <tr>
            <td>${idx++}</td>
            <td><strong>${escapeHTML(name)}</strong></td>
            <td>${g.added.toLocaleString()}</td>
            <td>${g.deducted.toLocaleString()}</td>
            <td style="color:#dc2626;">${g.expired.toLocaleString()}</td>
            <td style="font-weight:800; color:${balanceColor};">${balance.toLocaleString()}</td>
          </tr>
        `;
      }).join('');

      // تحديث نسخة قسم السياحة (إن وُجدت)
      this.updateTourismTicketsBalance();
    },

    // ===== قسم السياحة: أرصدة التذاكر =====
    updateTourismTicketsBalance() {
      const tbody = $('tourismTicketsBalanceTableBody');
      if (!tbody) return;

      const today = new Date(new Date().toDateString());
      const grouped = {};
      this.currentTickets.forEach(t => {
        const name = (t.ticketName || '').trim() || 'بدون اسم مزار';
        if (!grouped[name]) grouped[name] = { added: 0, deducted: 0, expired: 0 };
        const qty = parseFloat(t.qty) || 0;
        if (t.action === 'صرف') {
          grouped[name].deducted += qty;
        } else {
          grouped[name].added += qty;
          if (t.expiryDate) {
            const expiryDateObj = new Date(t.expiryDate);
            if (expiryDateObj < today) grouped[name].expired += qty;
          }
        }
      });

      const names = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ar'));
      if (names.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد بيانات</td></tr>';
        return;
      }

      let idx = 1;
      tbody.innerHTML = names.map(name => {
        const g = grouped[name];
        const balance = g.added - g.deducted - g.expired;
        const balanceColor = balance < 0 ? '#dc2626' : (balance === 0 ? '#64748b' : '#15803d');
        return `
          <tr>
            <td>${idx++}</td>
            <td><strong>${escapeHTML(name)}</strong></td>
            <td>${g.added.toLocaleString()}</td>
            <td>${g.deducted.toLocaleString()}</td>
            <td style="color:#dc2626;">${g.expired.toLocaleString()}</td>
            <td style="font-weight:800; color:${balanceColor};">${balance.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    },

    exportTourismTicketsBalance() {
      const table = $('tourismTicketsBalanceTable');
      if (!table) return;
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length === 0 || (rows.length === 1 && rows[0].children.length === 1)) return showToast('لا توجد بيانات', 'error');
      const wb = XLSX.utils.table_to_book(table, { sheet: "أرصدة التذاكر" });
      XLSX.writeFile(wb, "Tourism_Tickets_Balance.xlsx");
    },

    exportTicketsBalance() {
      const table = $('ticketsBalanceTable');
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length === 0 || (rows.length === 1 && rows[0].children.length === 1)) return showToast('لا توجد بيانات', 'error');
      const wb = XLSX.utils.table_to_book(table, { sheet: "أرصدة التذاكر" });
      XLSX.writeFile(wb, "Tickets_Balance.xlsx");
    },

    // 5. SETTLEMENTS
    listenToSettlements() {
      const q = query(collection(db, "settlement_records"), orderBy("createdAt", "desc"));
      onSnapshot(q, (snapshot) => {
        const tbody = $('settlementsTableBody');
        const archiveTbody = $('settlementsArchiveTableBody');
        const operatorSelect = $('operatorFilterSelect');
        const archiveOperatorSelect = $('archiveOperatorFilterSelect');

        this.currentSettlements = [];
        if (snapshot.empty) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">لا توجد تصفيات مسجلة</td></tr>';
          if (archiveTbody) archiveTbody.innerHTML = '<tr><td colspan="13" style="text-align:center;">لا توجد تصفيات معتمدة في الأرشيف</td></tr>';
          this.updateMasterDashboard();
          return;
        }

        let idx = 1;
        let archiveIdx = 1;
        let htmlBuffer = '';
        let archiveHtmlBuffer = '';
        const guidesSet = new Set();

        snapshot.forEach(docSnap => {
          const data = docSnap.data(); data.id = docSnap.id;
          if (data.isDeleted) return;
          this.currentSettlements.push(data);

          if (data.guideName) guidesSet.add(data.guideName.trim());

          const calcs = this.calculateSettlementValues(data.revenue, data.expenses, data.exchangeRate);
          const dateStr = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('en-GB') : '-';

          if (data.isApproved) {
            archiveHtmlBuffer += `
              <tr data-guide="${escapeHTML(data.guideName || '')}">
                <td>${archiveIdx++}</td>
                <td><strong>${escapeHTML(data.fileCode || '-')}</strong></td>
                <td>${escapeHTML(data.guideName || '-')}</td>
                <td>${calcs.revenue.toLocaleString()}</td>
                <td>${calcs.expenses.toLocaleString()}</td>
                <td>${calcs.profit.toLocaleString()}</td>
                <td>${calcs.netAfterTax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>10%</td>
                <td style="font-weight:700; color:#16a34a;">${calcs.commissionAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>${escapeHTML(data.notes || '-')}</td>
                <td><span class="badge badge-archive">معتمد</span></td>
                <td>${dateStr}</td>
                <td class="no-print">
                  <button class="unapprove-btn" onclick="App.unapproveSettlement('${docSnap.id}')">إلغاء الاعتماد</button>
                  <button class="delete-btn" onclick="App.deleteSettlement('${docSnap.id}')">حذف</button>
                </td>
              </tr>
            `;
          } else {
            htmlBuffer += `
              <tr data-guide="${escapeHTML(data.guideName || '')}">
                <td>${idx++}</td>
                <td><strong>${escapeHTML(data.fileCode || '-')}</strong></td>
                <td>${escapeHTML(data.guideName || '-')}</td>
                <td>${calcs.revenue.toLocaleString()}</td>
                <td>${calcs.expenses.toLocaleString()}</td>
                <td>${calcs.profit.toLocaleString()}</td>
                <td>${calcs.netAfterTax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>10%</td>
                <td style="font-weight:700; color:#16a34a;">${calcs.commissionAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>${escapeHTML(data.notes || '-')}</td>
                <td>${dateStr}</td>
                <td class="no-print">
                  <button class="approve-btn" onclick="App.approveSettlement('${docSnap.id}')">اعتماد</button>
                  <button class="edit-btn" onclick="App.openSettlementEditModal('${docSnap.id}')">تعديل</button>
                  <button class="delete-btn" onclick="App.deleteSettlement('${docSnap.id}')">حذف</button>
                </td>
              </tr>
            `;
          }
        });

        if (tbody) tbody.innerHTML = htmlBuffer || '<tr><td colspan="12" style="text-align:center;">لا توجد تصفيات جارية</td></tr>';
        if (archiveTbody) archiveTbody.innerHTML = archiveHtmlBuffer || '<tr><td colspan="13" style="text-align:center;">لا توجد تصفيات معتمدة في الأرشيف</td></tr>';

        const optionsHtml = '<option value="">-- جميع الأوبريتورز / المرشدين --</option>' + 
          Array.from(guidesSet).map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
        
        if (operatorSelect) {
          const curVal = operatorSelect.value;
          operatorSelect.innerHTML = optionsHtml;
          operatorSelect.value = curVal;
        }
        if (archiveOperatorSelect) {
          const curVal = archiveOperatorSelect.value;
          archiveOperatorSelect.innerHTML = optionsHtml;
          archiveOperatorSelect.value = curVal;
        }

        this.updateSettlementTotalCommission();
        this.updateArchiveSettlementTotalCommission();
        this.updateMasterDashboard();
      });
    },

    async saveSettlement() {
      const fileCode = $('fileCode').value.trim();
      const guideName = $('guideName').value.trim();
      const revenue = parseFloat($('settlementRevenue').value) || 0;
      const expenses = parseFloat($('settlementExpenses').value) || 0;
      const currency = $('settlementCurrency').value;
      const exchangeRate = parseFloat($('settlementExchangeRate').value) || 0;
      const notes = $('settlementNotes').value.trim();

      if (!fileCode || !guideName) return showToast('يرجى ادخال كود الملف واسم الأوبريتور', 'error');

      const btn = $('btnSaveSettlement'); btn.disabled = true;
      try {
        await addDoc(collection(db, "settlement_records"), {
          fileCode, guideName, revenue, expenses, currency, exchangeRate, notes, isApproved: false, isDeleted: false, createdAt: new Date()
        });
        showToast('تم حفظ التصفية بنجاح', 'success');
        $('fileCode').value = ''; $('guideName').value = ''; $('settlementRevenue').value = ''; $('settlementExpenses').value = '';
        $('settlementCurrency').value = 'USD'; $('settlementExchangeRate').value = ''; $('settlementNotes').value = '';
      } catch(e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; }
    },

    async deleteSettlement(id) {
      if (!confirm('تأكيد حذف التصفية؟')) return;
      try { await deleteDocAsync(doc(db, "settlement_records", id)); showToast('تم الحذف', 'success'); } catch(e) { showToast(e.message, 'error'); }
    },

    async approveSettlement(id) {
      try {
        await updateDoc(doc(db, "settlement_records", id), { isApproved: true, approvedAt: new Date() });
        showToast('تم اعتماد التصفية ونقلها للأرشيف', 'success');
      } catch(e) { showToast(e.message, 'error'); }
    },

    async unapproveSettlement(id) {
      try {
        await updateDoc(doc(db, "settlement_records", id), { isApproved: false });
        showToast('تم إلغاء الاعتماد وإعادتها للتصفيات الجارية', 'success');
      } catch(e) { showToast(e.message, 'error'); }
    },

    openSettlementEditModal(id) {
      const item = this.currentSettlements.find(s => s.id === id);
      if (!item) return;
      $('editSettlementId').value = id;
      $('editFileCode').value = item.fileCode || '';
      $('editGuideName').value = item.guideName || '';
      $('editSettlementRevenue').value = item.revenue || '';
      $('editSettlementExpenses').value = item.expenses || '';
      $('editSettlementCurrency').value = item.currency || 'USD';
      $('editSettlementExchangeRate').value = item.exchangeRate || '';
      $('editSettlementNotes').value = item.notes || '';
      $('editSettlementModal').style.display = 'flex';
    },

    closeSettlementEditModal() { $('editSettlementModal').style.display = 'none'; },

    async saveEditedSettlement() {
      const id = $('editSettlementId').value;
      const fileCode = $('editFileCode').value.trim();
      const guideName = $('editGuideName').value.trim();
      const revenue = parseFloat($('editSettlementRevenue').value) || 0;
      const expenses = parseFloat($('editSettlementExpenses').value) || 0;
      const currency = $('editSettlementCurrency').value;
      const exchangeRate = parseFloat($('editSettlementExchangeRate').value) || 0;
      const notes = $('editSettlementNotes').value.trim();

      if (!fileCode || !guideName) return showToast('يرجى استكمال البيانات', 'error');
      try {
        await updateDoc(doc(db, "settlement_records", id), { fileCode, guideName, revenue, expenses, currency, exchangeRate, notes });
        showToast('تم تعديل التصفية بنجاح', 'success');
        this.closeSettlementEditModal();
      } catch(e) { showToast(e.message, 'error'); }
    },

    exportSettlementsList() {
      const active = this.currentSettlements.filter(s => !s.isApproved);
      if (active.length === 0) return showToast('لا توجد بيانات للتصدير', 'error');
      const data = active.map((item, idx) => {
        const calcs = this.calculateSettlementValues(item.revenue, item.expenses, item.exchangeRate);
        return {
          "م": idx + 1, "كود الملف": item.fileCode, "اسم الأوبريتور": item.guideName,
          "الإيرادات": calcs.revenue, "المصروفات": calcs.expenses, "الربح": calcs.profit,
          "الصافي بعد الضريبة": calcs.netAfterTax, "نسبة العمولة": "10%", "مبلغ العمولة": calcs.commissionAmount,
          "ملاحظات": item.notes || ''
        };
      });
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "تصفيات الملفات"); XLSX.writeFile(wb, "Settlements_List.xlsx");
    },

    async importSettlementsFromExcel() {
      const input = $('settlementExcelFile');
      const file = input && input.files[0];
      if (!file) return showToast('يرجى اختيار ملف إكسيل أولاً', 'error');

      const btn = $('btnImportSettlementExcel');
      btn.disabled = true; btn.innerText = 'جاري الاستيراد...';
      try {
        const rows = await readExcelFileAsRows(file);
        const result = await bulkImportToCollection(rows, 'settlement_records', (row) => {
          const fileCode = String(getRowValueFlexible(row, ['كود الملف', 'رقم الملف']) ?? '').trim();
          const guideName = String(getRowValueFlexible(row, ['اسم الأوبريتور', 'الأوبريتور', 'المرشد']) ?? '').trim();
          if (!fileCode || !guideName) return null;

          const revenue = parseFlexNumber(getRowValueFlexible(row, ['الإيرادات', 'الايرادات']));
          const expenses = parseFlexNumber(getRowValueFlexible(row, ['المصروفات']));
          const notes = String(getRowValueFlexible(row, ['ملاحظات', 'ملاحظات التصفية']) ?? '').trim();

          return { fileCode, guideName, revenue, expenses, notes, isApproved: false, isDeleted: false, createdAt: new Date() };
        });
        showToast(`تم استيراد ${result.successCount} من ${result.total} سجل` + (result.skipCount ? ` (تم تجاهل ${result.skipCount} لعدم اكتمال البيانات)` : ''), 'success');
        input.value = '';
      } catch (e) { showToast(e.message, 'error'); }
      finally { btn.disabled = false; btn.innerText = '📥 اختيار ملف واستيراد'; }
    },

    exportArchiveSettlementsList() {
      const archived = this.currentSettlements.filter(s => s.isApproved);
      if (archived.length === 0) return showToast('لا توجد بيانات في الأرشيف للتصدير', 'error');
      const data = archived.map((item, idx) => {
        const calcs = this.calculateSettlementValues(item.revenue, item.expenses, item.exchangeRate);
        return {
          "م": idx + 1, "كود الملف": item.fileCode, "اسم الأوبريتور": item.guideName,
          "الإيرادات": calcs.revenue, "المصروفات": calcs.expenses, "الربح": calcs.profit,
          "الصافي بعد الضريبة": calcs.netAfterTax, "نسبة العمولة": "10%", "مبلغ العمولة": calcs.commissionAmount,
          "ملاحظات": item.notes || '', "الحالة": "معتمد"
        };
      });
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "أرشيف التصفيات"); XLSX.writeFile(wb, "Settlements_Archive_List.xlsx");
    },

    updateSettlementTotalCommission() {
      let total = 0;
      const trs = document.querySelectorAll("#settlementsTable tbody tr");
      trs.forEach(tr => {
        if (tr.style.display !== 'none' && tr.children.length > 8) {
          const valStr = tr.children[8].innerText.replace(/,/g, '');
          const val = parseFloat(valStr) || 0;
          total += val;
        }
      });
      const elem = $('settlementTotalCommission');
      if (elem) elem.innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },

    updateArchiveSettlementTotalCommission() {
      let total = 0;
      const trs = document.querySelectorAll("#settlementsArchiveTable tbody tr");
      trs.forEach(tr => {
        if (tr.style.display !== 'none' && tr.children.length > 8) {
          const valStr = tr.children[8].innerText.replace(/,/g, '');
          const val = parseFloat(valStr) || 0;
          total += val;
        }
      });
      const elem = $('archiveSettlementTotalCommission');
      if (elem) elem.innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },

    updateMasterDashboard() {
      if ($('mDashTotalSuppliers')) $('mDashTotalSuppliers').innerText = this.currentSuppliers.length;

      let creditEGP = 0, creditUSD = 0, creditEUR = 0;
      this.currentCredit.forEach(c => {
        const amt = parseFloat(c.amount) || 0;
        const net = c.type === 'deposit' ? amt : -amt;
        const cur = (c.currency || 'EGP').toUpperCase();
        if (cur === 'USD') creditUSD += net;
        else if (cur === 'EUR') creditEUR += net;
        else creditEGP += net;
      });
      if ($('mDashCreditEGP')) $('mDashCreditEGP').innerText = creditEGP.toLocaleString();
      if ($('mDashCreditUSD')) $('mDashCreditUSD').innerText = creditUSD.toLocaleString();
      if ($('mDashCreditEUR')) $('mDashCreditEUR').innerText = creditEUR.toLocaleString();

      let totalAviation = this.currentAviation.reduce((acc, curr) => acc + (parseFloat(curr.ticketCost) || 0), 0);
      if ($('mDashTotalAviation')) $('mDashTotalAviation').innerText = totalAviation.toLocaleString();

      // إجمالي عدد التذاكر الفعلية (الرصيد المتبقي الصالح لكل المزارات مجمّعة) = الإضافة - الصرف - المنتهي الصلاحية
      const todayStart = new Date(new Date().toDateString());
      const ticketGroups = {};
      this.currentTickets.forEach(t => {
        const name = (t.ticketName || '').trim() || 'بدون اسم مزار';
        if (!ticketGroups[name]) ticketGroups[name] = { added: 0, deducted: 0, expired: 0 };
        const qty = parseFloat(t.qty) || 0;
        if (t.action === 'صرف') {
          ticketGroups[name].deducted += qty;
        } else {
          ticketGroups[name].added += qty;
          if (t.expiryDate) {
            const expiryDateObj = new Date(t.expiryDate);
            if (expiryDateObj < todayStart) ticketGroups[name].expired += qty;
          }
        }
      });
      let totalTickets = 0;
      Object.values(ticketGroups).forEach(g => { totalTickets += (g.added - g.deducted - g.expired); });
      if ($('mDashTotalTickets')) $('mDashTotalTickets').innerText = totalTickets.toLocaleString();

      let totalCommissions = 0;
      this.currentSettlements.forEach(s => {
        const calcs = this.calculateSettlementValues(s.revenue, s.expenses, s.exchangeRate);
        totalCommissions += calcs.commissionAmount;
      });
      if ($('mDashTotalSettlementCommissions')) $('mDashTotalSettlementCommissions').innerText = totalCommissions.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

      const tbody = $('masterDashboardTbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr><td>${t('table_sector_tax_discount')}</td><td>${this.currentSuppliers.length}</td><td>-</td><td>-</td><td>${this.currentSuppliers.length} ${t('suffix_suppliers')}</td></tr>
          <tr><td>${t('table_sector_credit')}</td><td>${this.currentCredit.length}</td><td>-</td><td>-</td><td>EGP: ${creditEGP.toLocaleString()} | USD: ${creditUSD.toLocaleString()}</td></tr>
          <tr><td>${t('table_sector_settlement')}</td><td>${this.currentSettlements.length}</td><td>-</td><td>-</td><td>${t('label_total_commissions')}: ${totalCommissions.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
          <tr><td>${t('table_sector_aviation')}</td><td>${this.currentAviation.length}</td><td>-</td><td>${totalAviation.toLocaleString()}</td><td>-</td></tr>
          <tr><td>${t('table_sector_tickets')}</td><td>${this.currentTickets.length}</td><td>-</td><td>${totalTickets.toLocaleString()}</td><td>-</td></tr>
        `;
      }
    }
  };

  window.App = App;
  window.showToast = showToast;

  let appInitialized = false;
  const initAppOnce = () => {
    if (appInitialized) return;
    appInitialized = true;
    App.init();
  };

  // نشغّل التطبيق فورًا من غير ما ننتظر نتيجة تسجيل الدخول، عشان أي مشكلة مؤقتة في المصادقة (زي مشاكل إعداد المشروع)
  // متوقفش وصول الفريق لبياناته. لو الـ Firestore Rules بتشترط تسجيل دخول، القراءة/الكتابة وقتها هترفض من Firestore نفسها
  // برسالة صلاحيات واضحة، لكن النظام نفسه هيفضل شغال ومحاول.
  initAppOnce();

  // نحاول تسجيل الدخول المجهول في الخلفية (تجهيزًا لتفعيل الحماية لاحقًا)، من غير ما نعطّل عمل النظام لو فشل مؤقتًا
  onAuthStateChanged(auth, (user) => {
    if (user) initAppOnce();
  });

  signInAnonymously(auth).catch((error) => {
    console.error('Anonymous sign-in failed:', error);
  });
