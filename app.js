/**
 * ============================================================================
 * ملف البرمجة ومنطق التطبيق التفاعلي - نظام مُثمّن للتسعير الذكي
 * app.js
 * ============================================================================
 */

// ============================================================================
// اتصال قاعدة بيانات Supabase
// ============================================================================

const SUPABASE_URL = 'https://xwbnaxaastpaeguiuggf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zK4DWoY-7YUUmMKyecIkew_HmBXTvQB';
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ============================================================================
// 1. إدارة العملات والتنسيق المالي (Currency & Formatting Engine)
// ============================================================================

// قائمة العملات المدعومة مسبقاً مع الخانات العشرية ورموزها الرسمية
const CURRENCIES = {
    SAR: { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', decimals: 2 },
    YER: { code: 'YER', name: 'ريال يمني', symbol: 'ر.ي', decimals: 0 },
    AED: { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ', decimals: 2 },
    KWD: { code: 'KWD', name: 'دينار كويتي', symbol: 'د.ك', decimals: 3 },
    QAR: { code: 'QAR', name: 'ريال قطري', symbol: 'ر.ق', decimals: 2 },
    OMR: { code: 'OMR', name: 'ريال عماني', symbol: 'ر.ع', decimals: 3 },
    BHD: { code: 'BHD', name: 'دينار بحريني', symbol: 'د.ب', decimals: 3 },
    EGP: { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م', decimals: 2 },
    JOD: { code: 'JOD', name: 'دينار أردني', symbol: 'د.أ', decimals: 3 },
    IQD: { code: 'IQD', name: 'دينار عراقي', symbol: 'د.ع', decimals: 0 },
    DZD: { code: 'DZD', name: 'دينار جزائري', symbol: 'د.ج', decimals: 2 },
    MAD: { code: 'MAD', name: 'درهم مغربي', symbol: 'د.م', decimals: 2 },
    TND: { code: 'TND', name: 'دينار تونسي', symbol: 'د.ت', decimals: 3 },
    LYD: { code: 'LYD', name: 'دينار ليبي', symbol: 'د.ل', decimals: 3 },
    SDG: { code: 'SDG', name: 'جنيه سوداني', symbol: 'ج.س', decimals: 2 },
    USD: { code: 'USD', name: 'دولار أمريكي', symbol: '$', decimals: 2 },
    EUR: { code: 'EUR', name: 'يورو', symbol: '€', decimals: 2 }
};

// العملة النشطة حالياً بالتطبيق (افتراضياً الريال السعودي)
let currentCurrency = CURRENCIES.SAR;

/**
 * تهيئة العملة واسترجاع الإعداد المحفوظ من قاعدة البيانات
 */
async function initCurrency() {
    if (!supabaseClient) {
        showToast('تعذر تحميل اتصال قاعدة البيانات', 'warning');
        updateCurrencyUI();
        return;
    }

    const { data, error } = await supabaseClient
        .from('current_currency')
        .select('*')
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Currency load error:', error);
        showToast('تعذر تحميل العملة من قاعدة البيانات', 'warning');
    } else if (data?.symbol) {
        currentCurrency = data;
    }
    updateCurrencyUI();
}

/**
 * التعامل مع اختيار العملة من القائمة المنسدلة
 */
function handleCurrencyChange(code) {
    if (code === 'CUSTOM') {
        openCurrencyModal();
    } else if (CURRENCIES[code]) {
        setCurrency(CURRENCIES[code]);
    }
}

/**
 * حفظ العملة وتحديث واجهة المستخدم والحسابات اللحظية
 */
async function setCurrency(curr) {
    if (!supabaseClient) {
        showToast('تعذر حفظ العملة: اتصال قاعدة البيانات غير متاح', 'warning');
        return;
    }

    const { error: deleteError } = await supabaseClient
        .from('current_currency')
        .delete()
        .neq('code', '');

    if (deleteError) {
        console.error('Currency delete error:', deleteError);
        showToast('تعذر تحديث العملة في قاعدة البيانات', 'warning');
        return;
    }

    const { error: insertError } = await supabaseClient
        .from('current_currency')
        .insert(curr);

    if (insertError) {
        console.error('Currency save error:', insertError);
        showToast('تعذر حفظ العملة في قاعدة البيانات', 'warning');
        return;
    }

    currentCurrency = curr;
    updateCurrencyUI();
    calculateRealtime();
    renderDashboard();
    calculateBreakEven();
    showToast(`تم تعيين العملة إلى: ${currentCurrency.name} (${currentCurrency.symbol})`, 'success');
}

/**
 * تحديث كل مسميات ورموز العملة في الواجهة
 */
function updateCurrencyUI() {
    const selectEl = document.getElementById('currency-select');
    if (selectEl) {
        let foundOption = false;
        for (let opt of selectEl.options) {
            if (opt.value === currentCurrency.code) {
                selectEl.value = currentCurrency.code;
                foundOption = true;
                break;
            }
        }
        if (!foundOption) {
            let customOpt = selectEl.querySelector('option[data-custom-curr="true"]');
            if (!customOpt) {
                customOpt = document.createElement('option');
                customOpt.setAttribute('data-custom-curr', 'true');
                selectEl.insertBefore(customOpt, selectEl.lastElementChild);
            }
            customOpt.value = currentCurrency.code || 'CUSTOM_ACTIVE';
            customOpt.textContent = `★ ${currentCurrency.name} (${currentCurrency.symbol})`;
            selectEl.value = customOpt.value;
        }
    }

    const mobileSym = document.getElementById('mobile-current-currency-symbol');
    if (mobileSym) mobileSym.textContent = currentCurrency.symbol;

    document.querySelectorAll('.unit-sym').forEach(el => {
        el.textContent = currentCurrency.symbol;
    });

    const currNameEl = document.getElementById('display-currency-name');
    if (currNameEl) currNameEl.textContent = currentCurrency.name;
}

/**
 * فتح وإغلاق نافذة تخصيص العملة
 */
function openCurrencyModal() {
    document.getElementById('custom-currency-modal').classList.remove('hidden');
}

function closeCurrencyModal() {
    document.getElementById('custom-currency-modal').classList.add('hidden');
    updateCurrencyUI();
}

/**
 * حفظ عملة مخصصة يدوياً وتطبيقها
 */
function saveCustomCurrency() {
    const name = document.getElementById('custom-curr-name').value.trim() || 'عملة مخصصة';
    const symbol = document.getElementById('custom-curr-symbol').value.trim() || 'عملة';
    const decimals = parseInt(document.getElementById('custom-curr-decimals').value, 10) || 0;

    const customObj = {
        code: 'CUSTOM_' + Date.now(),
        name: name,
        symbol: symbol,
        decimals: decimals
    };

    setCurrency(customObj);
    closeCurrencyModal();
    document.getElementById('custom-curr-name').value = '';
    document.getElementById('custom-curr-symbol').value = '';
}

/**
 * دوال مساعدة لتنسيق الأرقام والعملات
 */
function formatNumber(num) {
    const dec = (typeof currentCurrency.decimals === 'number') ? currentCurrency.decimals : 2;
    return Number(num || 0).toLocaleString('ar-SA', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec
    });
}

function formatCurrency(num) {
    return formatNumber(num) + ' ' + currentCurrency.symbol;
}


// ============================================================================
// 2. إدارة البيانات وحفظها في التخزين المحلي (Storage & Mock Data)
// ============================================================================

// نماذج عينات افتراضية أولية للمشاريع
const DEFAULT_MOCK_DATA = [
    {
        id: 'prod-1',
        name: 'كعكة شوكولاتة بلجيكية فاخرة',
        category: 'حلويات ومخبوزات',
        materials: 45,
        packaging: 15,
        delivery: 20,
        laborHours: 2.5,
        hourlyRate: 30,
        laborCost: 75,
        gatewayFeePct: 0,
        vatPct: 0,
        totalCost: 155,
        marginPct: 50,
        sellingPrice: 232.5,
        netProfit: 77.5,
        date: '2026-10-25'
    },
    {
        id: 'prod-2',
        name: 'فستان مطرز يدوياً بنمط تراثي',
        category: 'أزياء وخياطة',
        materials: 120,
        packaging: 25,
        delivery: 35,
        laborHours: 6.0,
        hourlyRate: 40,
        laborCost: 240,
        gatewayFeePct: 0,
        vatPct: 0,
        totalCost: 420,
        marginPct: 100,
        sellingPrice: 840,
        netProfit: 420,
        date: '2026-10-26'
    },
    {
        id: 'prod-3',
        name: 'شمعة صويا معطرة بزيت اللافندر',
        category: 'عطور وشموع',
        materials: 18,
        packaging: 7,
        delivery: 15,
        laborHours: 1.0,
        hourlyRate: 25,
        laborCost: 25,
        gatewayFeePct: 0,
        vatPct: 0,
        totalCost: 65,
        marginPct: 50,
        sellingPrice: 97.5,
        netProfit: 32.5,
        date: '2026-10-27'
    },
    {
        id: 'prod-4',
        name: 'مجموعة صابون طبيعي بزيت الزيتون',
        category: 'حرف يدوية وهدايا',
        materials: 14,
        packaging: 5,
        delivery: 15,
        laborHours: 0.75,
        hourlyRate: 30,
        laborCost: 22.5,
        gatewayFeePct: 0,
        vatPct: 0,
        totalCost: 56.5,
        marginPct: 50,
        sellingPrice: 84.75,
        netProfit: 28.25,
        date: '2026-10-27'
    },
    {
        id: 'prod-5',
        name: 'باقة ورد مجفف وتنسيق هدايا',
        category: 'حرف يدوية وهدايا',
        materials: 55,
        packaging: 20,
        delivery: 20,
        laborHours: 1.5,
        hourlyRate: 35,
        laborCost: 52.5,
        gatewayFeePct: 0,
        vatPct: 0,
        totalCost: 147.5,
        marginPct: 20,
        sellingPrice: 177,
        netProfit: 29.5,
        date: '2026-10-28'
    }
];

// الحالة العامة للتطبيق (Global State)
let products = [];
let selectedMargin = 50; // هامش الربح المختار افتراضياً
let isCustomMargin = false;
let editingProductId = null; // معرّف المنتج الجاري تعديله حالياً
let temporaryBomList = []; // قائمة بنود المواد المفصلة المؤقتة
let profitChartInstance = null; // كائن الرسم البياني الشريطي
let costChartInstance = null; // كائن الرسم البياني الدائري

/**
 * استرجاع المنتجات من قاعدة البيانات
 */
function normalizeProduct(product) {
    const numericFields = [
        'materials', 'packaging', 'delivery', 'laborHours', 'hourlyRate',
        'laborCost', 'gatewayFeePct', 'vatPct', 'totalCost', 'marginPct',
        'sellingPrice', 'netProfit'
    ];
    const normalized = { ...product };
    numericFields.forEach(field => {
        normalized[field] = Number(normalized[field] || 0);
    });
    normalized.bomItems = Array.isArray(normalized.bomItems) ? normalized.bomItems : [];
    return normalized;
}

async function initStorage() {
    if (!supabaseClient) {
        products = [];
        updateBadgeCount();
        return;
    }

    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        console.error('Products load error:', error);
        showToast('تعذر تحميل المنتجات من قاعدة البيانات', 'warning');
        products = [];
    } else {
        products = (data || []).map(normalizeProduct);
    }
    updateBadgeCount();
}

async function saveToStorage(product) {
    if (!supabaseClient) {
        showToast('تعذر حفظ المنتج: اتصال قاعدة البيانات غير متاح', 'warning');
        return false;
    }

    const { error } = await supabaseClient
        .from('products')
        .upsert(normalizeProduct(product), { onConflict: 'id' });

    if (error) {
        console.error('Product save error:', error);
        showToast('تعذر حفظ المنتج في قاعدة البيانات', 'warning');
        return false;
    }

    return true;
}

async function replaceProductsInDatabase(nextProducts) {
    if (!supabaseClient) {
        showToast('تعذر تحديث المنتجات: اتصال قاعدة البيانات غير متاح', 'warning');
        return false;
    }

    const { error: deleteError } = await supabaseClient
        .from('products')
        .delete()
        .neq('id', '');

    if (deleteError) {
        console.error('Products delete error:', deleteError);
        showToast('تعذر تحديث المنتجات في قاعدة البيانات', 'warning');
        return false;
    }

    if (nextProducts.length > 0) {
        const { error: insertError } = await supabaseClient
            .from('products')
            .insert(nextProducts.map(normalizeProduct));

        if (insertError) {
            console.error('Products insert error:', insertError);
            showToast('تعذر حفظ المنتجات في قاعدة البيانات', 'warning');
            return false;
        }
    }

    return true;
}

function updateBadgeCount() {
    const badge = document.getElementById('badge-count');
    if (badge) badge.textContent = products.length;
}


// ============================================================================
// 3. محرك حساب التكاليف والتسعير الذكي اللحظي (Cost & Pricing Engine)
// ============================================================================

/**
 * الحساب اللحظي الفوري لكافة بنود التكلفة واقتراحات الأسعار
 */
function calculateRealtime() {
    const materials = parseFloat(document.getElementById('cost-materials').value) || 0;
    const packaging = parseFloat(document.getElementById('cost-packaging').value) || 0;
    const delivery = parseFloat(document.getElementById('cost-delivery').value) || 0;
    const hours = parseFloat(document.getElementById('labor-hours').value) || 0;
    const rate = parseFloat(document.getElementById('hourly-rate').value) || 0;
    const gatewayPct = parseFloat(document.getElementById('gateway-fee-pct')?.value) || 0;
    const vatPct = parseFloat(document.getElementById('vat-fee-pct')?.value) || 0;

    const laborCost = hours * rate;
    const directCosts = materials + packaging + delivery;
    const baseCost = directCosts + laborCost;
    const totalCost = baseCost;

    // تحديث قيم بطاقات التكلفة
    document.getElementById('summary-labor-cost').textContent = formatCurrency(laborCost);
    document.getElementById('display-labor-cost').textContent = formatCurrency(laborCost);
    document.getElementById('display-direct-costs').textContent = formatCurrency(directCosts);
    document.getElementById('display-total-cost').textContent = formatNumber(totalCost);

    // دالة مساعدة لحساب باقات التسعير مع مراعاة العمولات والضرائب
    const calcTier = (pct) => {
        let profit = totalCost * (pct / 100);
        let price = totalCost + profit;

        if (gatewayPct > 0 || vatPct > 0) {
            const extraFees = price * ((gatewayPct + vatPct) / 100);
            price += extraFees;
        }
        return { price, profit };
    };

    const t20 = calcTier(20);
    const t50 = calcTier(50);
    const t100 = calcTier(100);

    document.getElementById('price-tier-20').textContent = formatCurrency(t20.price);
    document.getElementById('profit-tier-20').textContent = '+' + formatCurrency(t20.profit);

    document.getElementById('price-tier-50').textContent = formatCurrency(t50.price);
    document.getElementById('profit-tier-50').textContent = '+' + formatCurrency(t50.profit);

    document.getElementById('price-tier-100').textContent = formatCurrency(t100.price);
    document.getElementById('profit-tier-100').textContent = '+' + formatCurrency(t100.profit);

    // حساب النسبة المخصصة عبر السلايدر
    const customSlider = document.getElementById('custom-margin-slider');
    const customVal = parseFloat(customSlider.value) || 35;
    const customTier = calcTier(customVal);
    document.getElementById('custom-price-display').textContent = formatCurrency(customTier.price);
    document.getElementById('custom-profit-display').textContent = '+' + formatCurrency(customTier.profit);

    // إعادة حساب الخصم النشط إن كان معروضاً
    recalcDiscount();
}

/**
 * اختيار إحدى باقات التسعير المحددة (20%, 50%, 100%)
 */
function selectPricingTier(marginPct) {
    selectedMargin = marginPct;
    isCustomMargin = false;

    document.getElementById('custom-margin-box').classList.remove('border-emerald-500');

    [20, 50, 100].forEach(tier => {
        const card = document.getElementById(`tier-card-${tier}`);
        const radioDot = card.querySelector('.tier-radio > div');
        const radioBorder = card.querySelector('.tier-radio');

        if (tier === marginPct) {
            card.className = "tier-card cursor-pointer p-4 rounded-xl border-2 border-emerald-600 bg-emerald-50/30 shadow-xs transition-all duration-200 relative";
            if (radioDot) radioDot.classList.remove('hidden');
            if (radioBorder) {
                radioBorder.classList.remove('border-stone-300');
                radioBorder.classList.add('border-emerald-600');
            }
        } else {
            card.className = "tier-card cursor-pointer p-4 rounded-xl border-2 border-stone-200 hover:border-emerald-500/50 bg-stone-50/50 transition-all duration-200";
            if (radioDot) radioDot.classList.add('hidden');
            if (radioBorder) {
                radioBorder.classList.remove('border-emerald-600');
                radioBorder.classList.add('border-stone-300');
            }
        }
    });
}

function highlightCustomMargin() {
    [20, 50, 100].forEach(tier => {
        const card = document.getElementById(`tier-card-${tier}`);
        const radioDot = card.querySelector('.tier-radio > div');
        const radioBorder = card.querySelector('.tier-radio');
        card.className = "tier-card cursor-pointer p-4 rounded-xl border-2 border-stone-200 hover:border-emerald-500/50 bg-stone-50/50 transition-all duration-200";
        if (radioDot) radioDot.classList.add('hidden');
        if (radioBorder) {
            radioBorder.classList.remove('border-emerald-600');
            radioBorder.classList.add('border-stone-300');
        }
    });
    document.getElementById('custom-margin-box').classList.add('border-emerald-500');
}

function toggleCustomMargin() {
    const box = document.getElementById('custom-margin-box');
    const icon = document.getElementById('custom-margin-icon');
    if (box.classList.contains('hidden')) {
        box.classList.remove('hidden');
        icon.classList.add('rotate-180');
    } else {
        box.classList.add('hidden');
        icon.classList.remove('rotate-180');
    }
}

function toggleAdvancedFees() {
    const panel = document.getElementById('advanced-fees-panel');
    const chevron = document.getElementById('fees-chevron');
    const btn = document.getElementById('toggle-fees-btn');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        chevron.classList.add('rotate-180');
        btn.querySelector('span').textContent = 'إخفاء الإعدادات';
    } else {
        panel.classList.add('hidden');
        chevron.classList.remove('rotate-180');
        btn.querySelector('span').textContent = 'إظهار الإعدادات';
    }
}


// ============================================================================
// 4. حفظ وتعديل المنتجات بالسجل المالي (Save & Edit Ledger)
// ============================================================================

/**
 * حفظ المنتج الجديد أو تحديث المنتج القائم
 */
async function saveProductToLedger() {
    const nameInput = document.getElementById('product-name');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('يرجى كتابة اسم المنتج قبل الحفظ', 'warning');
        nameInput.focus();
        return;
    }

    const category = document.getElementById('product-category').value;
    const materials = parseFloat(document.getElementById('cost-materials').value) || 0;
    const packaging = parseFloat(document.getElementById('cost-packaging').value) || 0;
    const delivery = parseFloat(document.getElementById('cost-delivery').value) || 0;
    const hours = parseFloat(document.getElementById('labor-hours').value) || 0;
    const rate = parseFloat(document.getElementById('hourly-rate').value) || 0;
    const gatewayFeePct = parseFloat(document.getElementById('gateway-fee-pct')?.value) || 0;
    const vatPct = parseFloat(document.getElementById('vat-fee-pct')?.value) || 0;

    const laborCost = hours * rate;
    const totalCost = materials + packaging + delivery + laborCost;

    if (totalCost <= 0) {
        showToast('يرجى إدخال تكاليف حقيقية للمنتج (تكلفة المواد أو ساعات العمل)', 'warning');
        return;
    }

    const netProfit = totalCost * (selectedMargin / 100);
    let sellingPrice = totalCost + netProfit;

    if (gatewayFeePct > 0 || vatPct > 0) {
        sellingPrice += sellingPrice * ((gatewayFeePct + vatPct) / 100);
    }

    if (editingProductId) {
        const index = products.findIndex(p => p.id === editingProductId);
        if (index === -1) {
            showToast('تعذر العثور على المنتج المطلوب تعديله', 'warning');
            return;
        }

        const updatedProduct = {
            ...products[index],
            name,
            category,
            materials,
            packaging,
            delivery,
            laborHours: hours,
            hourlyRate: rate,
            laborCost,
            gatewayFeePct,
            vatPct,
            totalCost,
            marginPct: selectedMargin,
            sellingPrice,
            netProfit,
            bomItems: [...temporaryBomList]
        };

        if (!await saveToStorage(updatedProduct)) return;
        products[index] = updatedProduct;
        showToast('تم تحديث "' + name + '" بنجاح!', 'success');
        cancelEditMode();
    } else {
        const newProduct = {
            id: 'prod-' + Date.now(),
            name,
            category,
            materials,
            packaging,
            delivery,
            laborHours: hours,
            hourlyRate: rate,
            laborCost,
            gatewayFeePct,
            vatPct,
            totalCost,
            marginPct: selectedMargin,
            sellingPrice,
            netProfit,
            bomItems: [...temporaryBomList],
            date: new Date().toISOString().split('T')[0]
        };

        if (!await saveToStorage(newProduct)) return;
        products.unshift(newProduct);
        showToast('تم حفظ "' + name + '" بنجاح في السجل المالي!', 'success');
    }

    updateBadgeCount();
    resetCalculatorForm();
    renderDashboard();
    calculateBreakEven();
}

/**
 * تحميل منتج من الجدول إلى الحاسبة للتعديل
 */
function loadProductToCalculator(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    editingProductId = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-category').value = product.category || 'أخرى';
    document.getElementById('cost-materials').value = product.materials;
    document.getElementById('cost-packaging').value = product.packaging;
    document.getElementById('cost-delivery').value = product.delivery;
    document.getElementById('labor-hours').value = product.laborHours;
    document.getElementById('hourly-rate').value = product.hourlyRate;
    document.getElementById('gateway-fee-pct').value = product.gatewayFeePct || 0;
    document.getElementById('vat-fee-pct').value = product.vatPct || 0;

    temporaryBomList = product.bomItems ? [...product.bomItems] : [];
    updateBomNotice();

    if ([20, 50, 100].includes(product.marginPct)) {
        selectPricingTier(product.marginPct);
    } else {
        const slider = document.getElementById('custom-margin-slider');
        slider.value = product.marginPct;
        document.getElementById('custom-margin-val-display').textContent = product.marginPct + '%';
        toggleCustomMargin();
        highlightCustomMargin();
        selectedMargin = product.marginPct;
    }

    // تفعيل واجهة وضع التعديل
    document.getElementById('editing-banner').classList.remove('hidden');
    document.getElementById('editing-product-name-label').textContent = product.name;
    document.getElementById('btn-save-text').textContent = 'حفظ التعديلات على المنتج';

    calculateRealtime();
    switchTab('calc');
    showToast(`تم تحميل بيانات "${product.name}" للتعديل`, 'info');
}

function cancelEditMode() {
    editingProductId = null;
    document.getElementById('editing-banner').classList.add('hidden');
    document.getElementById('btn-save-text').textContent = 'حفظ المنتج في السجل المالي';
    resetCalculatorForm();
}

function resetCalculatorForm() {
    document.getElementById('product-name').value = '';
    document.getElementById('cost-materials').value = '0';
    document.getElementById('cost-packaging').value = '0';
    document.getElementById('cost-delivery').value = '0';
    document.getElementById('labor-hours').value = '1';
    document.getElementById('hourly-rate').value = '30';
    document.getElementById('gateway-fee-pct').value = '0';
    document.getElementById('vat-fee-pct').value = '0';
    temporaryBomList = [];
    updateBomNotice();
    selectPricingTier(50);
    calculateRealtime();
    document.getElementById('discount-result-box').classList.add('hidden');
}

function loadSampleToCalc() {
    document.getElementById('product-name').value = 'شمعة صويا فاخرة برائحة الفانيليا';
    document.getElementById('product-category').value = 'عطور وشموع';
    document.getElementById('cost-materials').value = '22';
    document.getElementById('cost-packaging').value = '8';
    document.getElementById('cost-delivery').value = '15';
    document.getElementById('labor-hours').value = '1.25';
    document.getElementById('hourly-rate').value = '35';
    selectPricingTier(50);
    calculateRealtime();
    showToast('تم تحميل نموذج تجريبي إلى الحاسبة', 'info');
}


// ============================================================================
// 5. محاكي الخصومات وحماية الأرباح (Discount Simulator)
// ============================================================================

let activeDiscountPct = 0;

function testDiscount(pct) {
    activeDiscountPct = pct;
    recalcDiscount();
}

function recalcDiscount() {
    if (activeDiscountPct <= 0) return;

    const materials = parseFloat(document.getElementById('cost-materials').value) || 0;
    const packaging = parseFloat(document.getElementById('cost-packaging').value) || 0;
    const delivery = parseFloat(document.getElementById('cost-delivery').value) || 0;
    const hours = parseFloat(document.getElementById('labor-hours').value) || 0;
    const rate = parseFloat(document.getElementById('hourly-rate').value) || 0;
    const totalCost = (materials + packaging + delivery) + (hours * rate);

    const baseProfit = totalCost * (selectedMargin / 100);
    const originalPrice = totalCost + baseProfit;

    const discountAmount = originalPrice * (activeDiscountPct / 100);
    const discountedPrice = originalPrice - discountAmount;
    const discountedProfit = discountedPrice - totalCost;

    const resultBox = document.getElementById('discount-result-box');
    resultBox.classList.remove('hidden');

    document.getElementById('discounted-price-val').textContent = formatCurrency(discountedPrice);
    document.getElementById('discounted-profit-val').textContent = (discountedProfit >= 0 ? '+' : '') + formatCurrency(discountedProfit);

    const warningEl = document.getElementById('discount-warning');
    if (discountedProfit < 0) {
        warningEl.classList.remove('hidden');
        document.getElementById('discounted-profit-val').className = "font-black text-rose-600";
    } else {
        warningEl.classList.add('hidden');
        document.getElementById('discounted-profit-val').className = "font-black text-emerald-600";
    }
}


// ============================================================================
// 6. قائمة تفصيل المقادير والمكونات (Bill of Materials - BOM Engine)
// ============================================================================

function openBomModal() {
    const container = document.getElementById('bom-rows-container');
    container.innerHTML = '';

    if (temporaryBomList.length === 0) {
        addBomRow('مكون 1 (دقيق، قماش، شمع...)', 0);
        addBomRow('مكون 2 (زيوت، خيوط، عطر...)', 0);
    } else {
        temporaryBomList.forEach(item => {
            addBomRow(item.name, item.cost);
        });
    }

    calcBomModalTotal();
    document.getElementById('bom-modal').classList.remove('hidden');
}

function closeBomModal() {
    document.getElementById('bom-modal').classList.add('hidden');
}

function addBomRow(name = '', cost = 0) {
    const container = document.getElementById('bom-rows-container');
    const row = document.createElement('div');
    row.className = "flex items-center gap-2 bom-row";
    row.innerHTML = `
        <input type="text" placeholder="اسم المكون أو المادة الخام" value="${escapeHtml(name)}"
            class="bom-name flex-grow px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600">
        <div class="relative w-28">
            <input type="number" min="0" step="any" placeholder="التكلفة" value="${cost}" oninput="calcBomModalTotal()"
                class="bom-cost w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600">
            <span class="unit-sym absolute left-2.5 top-2 text-[10px] text-stone-400 font-bold">${currentCurrency.symbol}</span>
        </div>
        <button type="button" onclick="this.parentElement.remove(); calcBomModalTotal();"
            class="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        </button>
    `;
    container.appendChild(row);
}

function calcBomModalTotal() {
    const costs = document.querySelectorAll('.bom-cost');
    let total = 0;
    costs.forEach(c => {
        total += parseFloat(c.value) || 0;
    });
    document.getElementById('bom-modal-total-display').textContent = formatCurrency(total);
    return total;
}

function applyBomToCalculator() {
    const rows = document.querySelectorAll('.bom-row');
    temporaryBomList = [];
    let total = 0;

    rows.forEach(r => {
        const name = r.querySelector('.bom-name').value.trim();
        const cost = parseFloat(r.querySelector('.bom-cost').value) || 0;
        if (name || cost > 0) {
            temporaryBomList.push({ name: name || 'مكون بدون اسم', cost });
            total += cost;
        }
    });

    document.getElementById('cost-materials').value = total;
    updateBomNotice();
    calculateRealtime();
    closeBomModal();
    showToast(`تم تطبيق إجمالي قائمة المواد (${formatCurrency(total)}) في الحاسبة`, 'success');
}

function updateBomNotice() {
    const notice = document.getElementById('bom-active-notice');
    const countEl = document.getElementById('bom-items-count');
    if (temporaryBomList && temporaryBomList.length > 0) {
        notice.classList.remove('hidden');
        countEl.textContent = temporaryBomList.length;
    } else {
        notice.classList.add('hidden');
    }
}


// ============================================================================
// 7. لوحة القيادة، الرسوم البيانية وجدول السجل (Dashboard & Charts)
// ============================================================================

function renderDashboard() {
    const sortedProducts = [...products].sort((a, b) => b.netProfit - a.netProfit);
    const totalCount = sortedProducts.length;

    document.getElementById('kpi-count').textContent = totalCount;

    if (totalCount > 0) {
        const totalProfits = sortedProducts.reduce((sum, p) => sum + p.netProfit, 0);
        const avgMargin = sortedProducts.reduce((sum, p) => sum + p.marginPct, 0) / totalCount;
        const topProduct = sortedProducts[0];

        document.getElementById('kpi-avg-margin').textContent = avgMargin.toFixed(0) + '%';
        document.getElementById('kpi-top-product').textContent = topProduct.name;
        document.getElementById('kpi-top-product').title = topProduct.name;
        document.getElementById('kpi-total-profit').textContent = formatCurrency(totalProfits);
    } else {
        document.getElementById('kpi-avg-margin').textContent = '0%';
        document.getElementById('kpi-top-product').textContent = '-';
        document.getElementById('kpi-total-profit').textContent = formatCurrency(0);
    }

    renderBarChart(sortedProducts);
    renderCostDoughnutChart(sortedProducts);
    renderProductsTable(sortedProducts);
    updateBreakEvenProductOptions();
}

/**
 * رسم بياني شريطي لمقارنة التكلفة والربح
 */
function renderBarChart(sortedProducts) {
    const ctx = document.getElementById('profitComparisonChart');
    if (!ctx) return;

    if (profitChartInstance) profitChartInstance.destroy();
    if (sortedProducts.length === 0) return;

    const chartData = sortedProducts.slice(0, 8);
    const labels = chartData.map(p => p.name.length > 18 ? p.name.substring(0, 18) + '...' : p.name);
    const costs = chartData.map(p => p.totalCost);
    const profits = chartData.map(p => p.netProfit);

    profitChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `التكلفة الإجمالية (${currentCurrency.symbol})`,
                    data: costs,
                    backgroundColor: '#d5d1c8',
                    borderRadius: 6,
                    barPercentage: 0.65,
                    categoryPercentage: 0.6
                },
                {
                    label: `صافي الربح (${currentCurrency.symbol})`,
                    data: profits,
                    backgroundColor: '#059669',
                    borderRadius: 6,
                    barPercentage: 0.65,
                    categoryPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rtl: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#272521',
                    titleFont: { family: 'Cairo', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Cairo', size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    rtl: true,
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Cairo', size: 11 }, color: '#757065' }
                },
                y: {
                    position: 'right',
                    grid: { color: '#f0ede6' },
                    ticks: {
                        font: { family: 'Cairo', size: 11 },
                        color: '#757065',
                        callback: val => formatNumber(val) + ' ' + currentCurrency.symbol
                    }
                }
            }
        }
    });
}

/**
 * رسم بياني دائري لتوزيع هيكل التكاليف
 */
function renderCostDoughnutChart(sortedProducts) {
    const ctx = document.getElementById('costBreakdownChart');
    if (!ctx) return;

    if (costChartInstance) costChartInstance.destroy();
    if (sortedProducts.length === 0) return;

    const totalMaterials = sortedProducts.reduce((sum, p) => sum + (p.materials || 0), 0);
    const totalPackaging = sortedProducts.reduce((sum, p) => sum + (p.packaging || 0), 0);
    const totalDelivery = sortedProducts.reduce((sum, p) => sum + (p.delivery || 0), 0);
    const totalLabor = sortedProducts.reduce((sum, p) => sum + (p.laborCost || 0), 0);

    costChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['مواد خام', 'تغليف وعلب', 'شحن وتوصيل', 'جهد ووقت بشري'],
            datasets: [{
                data: [totalMaterials, totalPackaging, totalDelivery, totalLabor],
                backgroundColor: ['#10b981', '#f59e0b', '#6366f1', '#64748b'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rtl: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Cairo', size: 10 }, boxWidth: 12 }
                },
                tooltip: {
                    backgroundColor: '#272521',
                    titleFont: { family: 'Cairo', size: 12 },
                    bodyFont: { family: 'Cairo', size: 12 },
                    rtl: true,
                    callbacks: {
                        label: ctx => `${ctx.label}: ${formatCurrency(ctx.parsed)}`
                    }
                }
            },
            cutout: '68%'
        }
    });
}

/**
 * بناء جدول المنتجات المحفوظة مع إمكانية الفلترة والبحث
 */
function renderProductsTable(customList = null) {
    const tableBody = document.getElementById('products-table-body');
    const emptyState = document.getElementById('table-empty-state');
    const searchVal = document.getElementById('search-products')?.value.toLowerCase().trim() || '';
    const categoryFilter = document.getElementById('filter-category')?.value || 'ALL';

    let list = customList || [...products].sort((a, b) => b.netProfit - a.netProfit);

    if (searchVal) {
        list = list.filter(p => p.name.toLowerCase().includes(searchVal));
    }

    if (categoryFilter !== 'ALL') {
        list = list.filter(p => (p.category || 'أخرى') === categoryFilter);
    }

    if (list.length === 0) {
        tableBody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    tableBody.innerHTML = list.map((item, index) => {
        return `
            <tr class="hover:bg-stone-50/80 transition-colors">
                <td class="py-4 px-4 font-bold text-stone-400">${index + 1}</td>
                <td class="py-4 px-4">
                    <div class="font-black text-stone-900 text-sm">${escapeHtml(item.name)}</div>
                    <div class="text-[11px] text-stone-400 mt-0.5">
                        <span class="bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded text-[10px] font-bold">${item.category || 'عام'}</span>
                        <span class="mr-1">${item.date || '-'}</span>
                    </div>
                </td>
                <td class="py-4 px-4 text-stone-500">
                    <span class="text-[11px]">
                        مواد: ${formatNumber(item.materials)} | جهد: ${formatNumber(item.laborCost)}
                    </span>
                </td>
                <td class="py-4 px-4 font-bold text-stone-800">${formatCurrency(item.totalCost)}</td>
                <td class="py-4 px-4 font-black text-stone-900">${formatCurrency(item.sellingPrice)}</td>
                <td class="py-4 px-4 font-black text-emerald-700">+${formatCurrency(item.netProfit)}</td>
                <td class="py-4 px-4">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        item.marginPct >= 100
                        ? 'bg-amber-100 text-amber-800'
                        : item.marginPct >= 50
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-stone-100 text-stone-700'
                    }">
                        ${item.marginPct}%
                    </span>
                </td>
                <td class="py-4 px-4 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="viewProductCard('${item.id}')" title="بطاقة التسعير والطباعة" class="p-1.5 text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        </button>
                        <button onclick="loadProductToCalculator('${item.id}')" title="تعديل المنتج" class="p-1.5 text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                        <button onclick="deleteProduct('${item.id}', '${escapeHtml(item.name)}')" title="حذف المنتج" class="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * حذف منتج من السجل
 */
async function deleteProduct(id, name) {
    if (confirm(`هل أنت متأكد من رغبتك في حذف "${name}" نهائياً من السجل؟`)) {
        if (!supabaseClient) {
            showToast('تعذر حذف المنتج: اتصال قاعدة البيانات غير متاح', 'warning');
            return;
        }

        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Product delete error:', error);
            showToast('تعذر حذف المنتج من قاعدة البيانات', 'warning');
            return;
        }

        products = products.filter(p => p.id !== id);
        updateBadgeCount();
        renderDashboard();
        calculateBreakEven();
        showToast('تم حذف "' + name + '" بنجاح', 'info');
    }
}

async function resetToMockData() {
    if (confirm('هل ترغب في إعادة ضبط البيانات إلى النماذج الافتراضية؟')) {
        const restoredProducts = DEFAULT_MOCK_DATA.map(normalizeProduct);
        if (!await replaceProductsInDatabase(restoredProducts)) return;
        products = restoredProducts;
        updateBadgeCount();
        renderDashboard();
        calculateBreakEven();
        showToast('تمت استعادة البيانات الافتراضية بنجاح', 'success');
    }
}


// ============================================================================
// 8. محرك حساب نقطة التعادل (Break-Even Analysis Engine)
// ============================================================================

function updateBreakEvenProductOptions() {
    const select = document.getElementById('be-product-select');
    if (!select) return;

    if (products.length === 0) {
        select.innerHTML = '<option value="">لا توجد منتجات مسجلة بعد</option>';
        return;
    }

    select.innerHTML = products.map(p => `
        <option value="${p.id}">${escapeHtml(p.name)} (ربح القطعة: ${formatCurrency(p.netProfit)})</option>
    `).join('');

    calculateBreakEven();
}

function calculateBreakEven() {
    const rent = parseFloat(document.getElementById('fixed-rent')?.value) || 0;
    const utils = parseFloat(document.getElementById('fixed-utilities')?.value) || 0;
    const marketing = parseFloat(document.getElementById('fixed-marketing')?.value) || 0;
    const subs = parseFloat(document.getElementById('fixed-subs')?.value) || 0;

    const totalFixed = rent + utils + marketing + subs;
    document.getElementById('be-total-fixed').textContent = formatCurrency(totalFixed);

    const productId = document.getElementById('be-product-select')?.value;
    const product = products.find(p => p.id === productId) || products[0];

    if (!product || product.netProfit <= 0) {
        document.getElementById('be-unit-margin').textContent = '0.00 ' + currentCurrency.symbol;
        document.getElementById('be-units-target').textContent = '0';
        document.getElementById('be-daily-target').textContent = '0 قطعة / يومياً';
        return;
    }

    const unitProfit = product.netProfit;
    document.getElementById('be-unit-margin').textContent = formatCurrency(unitProfit);

    // نقطة التعادل = إجمالي المصاريف الثابتة / صافي ربح القطعة الواحدة
    const requiredUnits = Math.ceil(totalFixed / unitProfit);
    document.getElementById('be-units-target').textContent = requiredUnits;

    const dailyTarget = (requiredUnits / 30).toFixed(1);
    document.getElementById('be-daily-target').textContent = `${dailyTarget} قطعة / يومياً`;
}


// ============================================================================
// 9. التصدير والاستيراد والطباعة (Export, Import & Print Engine)
// ============================================================================

/**
 * تصدير جدول المنتجات إلى ملف CSV يدعم العربية في Microsoft Excel
 */
function exportToCsv() {
    if (products.length === 0) {
        showToast('لا توجد منتجات لتصديرها', 'warning');
        return;
    }

    let csv = '\uFEFF'; // رمز UTF-8 BOM لضمان عدم تلف الحروف العربية في Excel
    csv += 'اسم المنتج,التصنيف,تكلفة المواد,تكلفة التغليف,تكلفة الشحن,ساعات العمل,أجر الساعة,تكلفة الجهد,التكلفة الكلية,هامش الربح %,سعر البيع,صافي الربح,تاريخ التسجيل\n';

    products.forEach(p => {
        const row = [
            `"${(p.name || '').replace(/"/g, '""')}"`,
            `"${(p.category || 'عام')}"`,
            p.materials || 0,
            p.packaging || 0,
            p.delivery || 0,
            p.laborHours || 0,
            p.hourlyRate || 0,
            p.laborCost || 0,
            p.totalCost || 0,
            p.marginPct || 0,
            p.sellingPrice || 0,
            p.netProfit || 0,
            `"${p.date || ''}"`
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `سجل_تكاليف_المنتجات_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('تم تصدير ملف Excel (CSV) بنجاح!', 'success');
}

/**
 * تصدير نسخة احتياطية بصيغة JSON
 */
function exportToJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(products, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `mothamen_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast('تم تصدير النسخة الاحتياطية JSON بنجاح', 'success');
}

/**
 * استيراد نسخة احتياطية من ملف JSON
 */
function importFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                const importedProducts = imported.map(normalizeProduct);
                if (!await replaceProductsInDatabase(importedProducts)) return;
                products = importedProducts;
                updateBadgeCount();
                renderDashboard();
                calculateBreakEven();
                showToast('تم استيراد ' + imported.length + ' منتج بنجاح!', 'success');
            } else {
                showToast('الملف المرفوع لا يحتوي على بنية بيانات صالحة', 'warning');
            }
        } catch (err) {
            showToast('حدث خطأ أثناء قراءة ملف JSON', 'warning');
        }
    };
    reader.readAsText(file);
}

/**
 * عرض بطاقة تسعير منتج وطباعتها
 */
function viewProductCard(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('card-prod-name').textContent = product.name;
    document.getElementById('card-prod-cat').textContent = product.category || 'منتج يدوي';
    document.getElementById('card-prod-materials').textContent = formatCurrency(product.materials + product.packaging + product.delivery);
    document.getElementById('card-prod-labor').textContent = formatCurrency(product.laborCost);
    document.getElementById('card-prod-total-cost').textContent = formatCurrency(product.totalCost);
    document.getElementById('card-prod-selling-price').textContent = formatCurrency(product.sellingPrice);
    document.getElementById('card-prod-profit').textContent = `+${formatCurrency(product.netProfit)} صافي ربح (${product.marginPct}%)`;
    document.getElementById('card-prod-date').textContent = product.date || new Date().toISOString().split('T')[0];

    document.getElementById('product-card-modal').classList.remove('hidden');
}

function closeProductCardModal() {
    document.getElementById('product-card-modal').classList.add('hidden');
}

function printCardOnly() {
    window.print();
}

function printFinancialReport() {
    window.print();
}


// ============================================================================
// 10. التنقل بين التبويبات وتهيئة واجهة المستخدم (UI & Tabs)
// ============================================================================

function switchTab(tab) {
    const viewCalc = document.getElementById('view-calc');
    const viewDash = document.getElementById('view-dashboard');
    const viewBE = document.getElementById('view-breakeven');

    const navCalc = document.getElementById('nav-calc');
    const navDash = document.getElementById('nav-dashboard');
    const navBE = document.getElementById('nav-breakeven');

    viewCalc.classList.add('hidden');
    viewDash.classList.add('hidden');
    viewBE.classList.add('hidden');

    const inactiveNavClass = "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold text-stone-600 hover:text-stone-900 transition-all duration-200";
    const activeNavClass = "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 bg-white text-emerald-700 shadow-xs";

    navCalc.className = inactiveNavClass;
    navDash.className = inactiveNavClass;
    navBE.className = inactiveNavClass;

    if (tab === 'calc') {
        viewCalc.classList.remove('hidden');
        navCalc.className = activeNavClass;
    } else if (tab === 'dashboard') {
        viewDash.classList.remove('hidden');
        navDash.className = activeNavClass;
        renderDashboard();
    } else if (tab === 'breakeven') {
        viewBE.classList.remove('hidden');
        navBE.className = activeNavClass;
        calculateBreakEven();
    }
}

function setupEventListeners() {
    const inputs = document.querySelectorAll('.calc-input');
    inputs.forEach(input => {
        input.addEventListener('input', calculateRealtime);
    });

    const customSlider = document.getElementById('custom-margin-slider');
    if (customSlider) {
        customSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            document.getElementById('custom-margin-val-display').textContent = val + '%';
            selectedMargin = parseFloat(val);
            isCustomMargin = true;
            highlightCustomMargin();
            calculateRealtime();
        });
    }
}


// ============================================================================
// 11. نظام الإشعارات المنبثقة الذكي (Toast Notification Engine)
// ============================================================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-xs sm:text-sm font-bold transition-all transform duration-300 translate-y-3 opacity-0 ${
        type === 'success'
            ? 'bg-emerald-800 text-white border-emerald-700 shadow-emerald-950/20'
            : type === 'warning'
                ? 'bg-amber-800 text-white border-amber-700 shadow-amber-950/20'
                : 'bg-stone-800 text-white border-stone-700 shadow-stone-950/20'
    }`;

    const iconSvg = type === 'success'
        ? '<svg class="w-5 h-5 text-emerald-300 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
        : type === 'warning'
            ? '<svg class="w-5 h-5 text-amber-300 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
            : '<svg class="w-5 h-5 text-stone-300 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    toast.innerHTML = `
        ${iconSvg}
        <span>${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-3', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * تأمين النصوص البرمجية ومنع ثغرات XSS
 */
function escapeHtml(string) {
    return String(string || '').replace(/[&<>"'`=\/]/g, function (s) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        }[s];
    });
}

// بدء تشغيل التطبيق عند اكتمال تحميل عناصر الصفحة
document.addEventListener('DOMContentLoaded', async () => {
    await initCurrency();
    await initStorage();
    setupEventListeners();
    calculateRealtime();
    renderDashboard();
    calculateBreakEven();
});

