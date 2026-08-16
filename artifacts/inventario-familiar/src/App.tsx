import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, Box, Check, ChevronDown, CircleDollarSign, ClipboardList,
  CreditCard, Download, History, Home as HomeIcon, LogOut, Menu, PackagePlus, Pencil, Plus, Search, ShoppingBasket,
  ShoppingCart, Sparkles, Trash2, TriangleAlert, TrendingUp, Upload, Users, Wallet, X
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { CompanyProvider, useCompany } from '@/lib/company';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import {
  getGetDashboardQueryKey, getGetSalesReportQueryKey, getListCreditPaymentsQueryKey, getListProductsQueryKey, getListPurchasesQueryKey, getListSalesQueryKey, getListSuppliersQueryKey,
  useAddInventory, useCreateCreditPayment, useCreateProduct, useCreatePurchase, useCreateSale, useCreateSupplier, useDeleteProduct, useDeletePurchase, useDeleteSale,
  useGetDashboard, useGetInventoryReport, useGetSalesReport, useImportPurchases, useListCreditPayments, useListProducts, useListPurchases, useListSales, useListSuppliers,
  useUpdateDeudaMoises, useUpdateProduct
} from '@workspace/api-client-react';
import type { Product, Purchase, PurchaseImportResult, PurchaseInput, Sale } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));
const PROVIDERS = [
  'Naruna / El Panal', 'Alves', 'Vegeta', 'Sorbetto', 'Suvi Fit', 'Prema', 'Bioessens', 'Vitalsinu',
  'Vitaliah', 'Agroinversiones Franes', 'Gano Excel', 'Cofarnat', 'Manavida', 'Montes de Maria',
  'Bio Supplements', 'Mauka', 'MultiAloe', 'Productos Nicolay',
];
const supplierOptions = (activeCompanyId: number | undefined, apiSuppliers: (string | null | undefined)[], productSuppliers: (string | null | undefined)[] = []) =>
  Array.from(new Set([...(activeCompanyId === 2 ? PROVIDERS : []), ...apiSuppliers.filter((s): s is string => !!s), ...productSuppliers.filter((s): s is string => !!s)])).sort((a, b) => a.localeCompare(b));
const PAYMENT_METHODS = ['Efectivo', 'Nequi', 'Transferencia', 'Datafono', 'QR / Llave', 'Crédito'];

function SupplierField({ value, onChange, testid }: { value: string; onChange: (v: string) => void; testid: string }) {
  const { activeCompany } = useCompany();
  const qc = useQueryClient();
  const suppliers = useListSuppliers();
  const products = useListProducts();
  const create = useCreateSupplier();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const options = useMemo(() => supplierOptions(activeCompany?.id, (suppliers.data || []).map((s) => s.name), (products.data || []).map((p) => p.supplier)), [suppliers.data, products.data, activeCompany]);
  const saveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError('Escribe el nombre del proveedor.'); return; }
    setError('');
    create.mutate({ data: { name: n } }, {
      onSuccess: (created) => {
        qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        onChange(created.name);
        setName('');
        setCreating(false);
      },
      onError: () => setError('No se pudo crear el proveedor.'),
    });
  };
  return <div className="grid gap-2"><label htmlFor={testid} className="text-sm font-semibold">Proveedor</label><div className="flex items-center gap-2"><select id={testid} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-xl border bg-[hsl(var(--card))] px-3 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid={testid}><option value="">Sin proveedor</option>{options.map((s) => <option key={s} value={s}>{s}</option>)}</select>{!creating && <button type="button" onClick={() => setCreating(true)} className="shrink-0 rounded-xl border border-dashed px-3 py-2.5 text-sm font-bold text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))]" data-testid={`button-new-${testid}`}>Nuevo</button>}</div>{creating && <form onSubmit={saveNew} className="flex items-center gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proveedor" autoFocus className="h-10 w-full rounded-xl border bg-[hsl(var(--card))] px-3 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid={`input-new-${testid}`} /><Button type="submit" disabled={create.isPending} className="h-10 px-3 text-sm" data-testid={`button-save-${testid}`}>{create.isPending ? 'Guardando…' : 'Guardar'}</Button><button type="button" onClick={() => { setCreating(false); setError(''); }} className="rounded-lg p-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid={`button-cancel-${testid}`}>Cancelar</button></form>}{error && <p className="text-xs text-[hsl(var(--destructive))]" data-testid={`status-${testid}-error`}>{error}</p>}</div>;
}

function crc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

async function zipBlob(files: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const body = file.data;
    const crc = crc32(body);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, body.length, true);
    dv.setUint32(22, body.length, true);
    dv.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local as BlobPart, body as BlobPart);
    const cd = new Uint8Array(46 + name.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, body.length, true);
    cdv.setUint32(24, body.length, true);
    cdv.setUint16(28, name.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + body.length;
  }
  const centralStart = offset;
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  for (const c of central) parts.push(c as BlobPart);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  parts.push(eocd as BlobPart);
  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function buildXlsxBlob(rows: (string | number)[][]): Promise<Blob> {
  const enc = new TextEncoder();
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows.map((row) => '<row>' + row.map((v) => typeof v === 'number' ? `<c><v>${v}</v></c>` : `<c t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`).join('') + '</row>').join('') + '</sheetData></worksheet>';
  const files = [
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ventas por día" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
  ];
  return zipBlob(files);
}

const downloadBlob = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const toCsv = (rows: (string | number)[][]) => '\uFEFF' + rows.map((r) => r.map((c) => { const s = String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-sm">
      <Box size={21} strokeWidth={2.5} />
    </span>
    {!compact && <span className="font-display text-lg font-bold tracking-tight">Inventario<span className="text-[hsl(var(--sidebar-primary))]">Familiar</span></span>}
  </Link>;
}

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-95 shadow-[0_4px_0_hsl(var(--primary-border))]',
    secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary)/.75)]',
    ghost: 'bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
    danger: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:brightness-95',
  };
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>{children}</button>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[hsl(var(--foreground))]">
    {label}<input {...props} className="h-11 w-full rounded-xl border bg-[hsl(var(--card))] px-3.5 font-normal outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" />
  </label>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && <p className="mb-2 font-mono-app text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">{eyebrow}</p>}
      <h1 className="font-display text-4xl font-bold leading-[.96] tracking-tight text-[hsl(var(--foreground))] sm:text-5xl">{title}</h1>
      {description && <p className="mt-3 max-w-xl text-[hsl(var(--muted-foreground))]">{description}</p>}
    </div>
    {action}
  </div>;
}

function StatusMessage({ type = 'error', text, onRetry }: { type?: 'error' | 'empty'; text: string; onRetry?: () => void }) {
  return <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed bg-[hsl(var(--card)/.5)] p-8 text-center">
    <div className="grid justify-items-center gap-3">
      <span className={`grid h-12 w-12 place-items-center rounded-2xl ${type === 'error' ? 'bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]' : 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'}`}>
        {type === 'error' ? <TriangleAlert size={22} /> : <PackagePlus size={22} />}
      </span>
      <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">{text}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry} data-testid="button-retry">Intentar de nuevo</Button>}
    </div>
  </div>;
}

function CompanySwitcher() {
  const { companies, activeCompany, selectCompany } = useCompany();
  const [open, setOpen] = useState(false);
  if (!activeCompany) return null;
  return <div className="relative mb-6">
    <button type="button" onClick={() => setOpen(!open)} data-testid="button-company-switcher" className="flex w-full items-center gap-3 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.55)] p-4 text-left transition-colors hover:bg-[hsl(var(--sidebar-accent)/.8)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-sm font-bold text-[hsl(var(--sidebar-primary-foreground))]">{activeCompany.name.slice(0, 2).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{activeCompany.name}</span>
        <span className="block text-[11px] text-[hsl(var(--sidebar-foreground)/.55)]">{companies.length === 1 ? 'Tu negocio' : 'Cambiar de negocio'}</span>
      </span>
      <ChevronDown size={16} className={`shrink-0 text-[hsl(var(--sidebar-foreground)/.6)] transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <><div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden /><div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border bg-[hsl(var(--card))] p-1.5 text-[hsl(var(--foreground))] shadow-xl">
      {companies.map((company) => <button key={company.id} type="button" onClick={() => { selectCompany(company); setOpen(false); }} data-testid={`option-company-${company.id}`} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${company.id === activeCompany.id ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted))]'}`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--secondary))] font-mono-app text-xs text-[hsl(var(--secondary-foreground))]">{company.name.slice(0, 2).toUpperCase()}</span>
        <span className="flex-1">{company.name}</span>
        {company.id === activeCompany.id && <Check size={15} className="text-[hsl(var(--primary))]" />}
      </button>)}
    </div></>}
  </div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const nav = [
    { href: '/app', label: 'Inicio', icon: HomeIcon },
    { href: '/app/productos', label: 'Productos', icon: Box },
    { href: '/app/venta', label: 'Registrar venta', icon: ShoppingCart },
    { href: '/app/compras', label: 'Compras', icon: ShoppingBasket },
    { href: '/app/cartera', label: 'Cartera', icon: CreditCard },
    { href: '/app/reportes', label: 'Reportes', icon: BarChart3 },
  ];
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-10 flex items-center justify-between"><Brand /><button className="text-[hsl(var(--sidebar-foreground)/.7)] md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={20} /></button></div>
      <CompanySwitcher />
      <nav className="grid gap-1">
        {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${location.pathname === href ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.7)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={19} /><span>{label}</span>{href === '/app/venta' && <span className="ml-auto h-2 w-2 rounded-full bg-[hsl(var(--sidebar-primary))]" />}</Link>)}
      </nav>
      <div className="mt-auto rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.55)] p-4">
        <Sparkles size={18} className="mb-3 text-[hsl(var(--sidebar-primary))]" />
        <p className="font-display text-lg leading-tight">Tu negocio, en orden.</p>
        <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--sidebar-foreground)/.58)]">Un vistazo claro para trabajar con tranquilidad.</p>
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-[hsl(var(--sidebar-border))] pt-5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--sidebar-primary))] text-xs font-bold text-[hsl(var(--sidebar-primary-foreground))]">{(user?.email?.[0] || 'F').toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user?.email || 'Mi cuenta'}</p><p className="truncate text-[11px] text-[hsl(var(--sidebar-foreground)/.55)]">{user?.email || 'Sesión activa'}</p></div>
        <button onClick={() => signOut()} className="rounded-lg p-2 text-[hsl(var(--sidebar-foreground)/.55)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]" title="Salir" data-testid="button-sign-out"><LogOut size={17} /></button>
      </div>
    </aside>
    <div className="md:pl-[264px]">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b bg-[hsl(var(--background)/.88)] px-5 backdrop-blur-md sm:px-8">
        <button className="flex items-center gap-2 rounded-lg p-2 font-bold text-[hsl(var(--muted-foreground))] md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={22} /><span>Menú</span></button>
        <div className="hidden items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] md:flex"><span className="h-2 w-2 rounded-full bg-[hsl(var(--accent-foreground))]" /> Todo listo para hoy</div>
        <div className="ml-auto flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]"><History size={15} /> {new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div>
      </header>
      <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">{children}</main>
    </div>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-[hsl(var(--foreground)/.35)] md:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" data-testid="button-menu-overlay" />}
  </div>;
}

function Landing() {
  const { isSignedIn, isLoaded } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/app" />;
  return <div className="soft-grid relative min-h-[100dvh] overflow-hidden bg-background">
    <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[hsl(var(--accent)/.55)] blur-3xl" />
    <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8"><Brand /><Link href="/sign-in" className="text-sm font-bold text-[hsl(var(--primary))] hover:underline" data-testid="link-landing-sign-in">Ya tengo una cuenta <ArrowRight size={15} className="ml-1 inline" /></Link></header>
    <main className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-12 sm:px-8 md:grid-cols-[1.08fr_.92fr] md:items-center md:pt-20">
      <section className="rise-in"><p className="mb-5 inline-flex items-center gap-2 rounded-full border bg-[hsl(var(--card)/.7)] px-3 py-1.5 font-mono-app text-[10px] font-bold uppercase tracking-[.15em] text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> Para negocios de familia</p><h1 className="max-w-2xl font-display text-6xl font-bold leading-[.91] tracking-[-.045em] sm:text-8xl">Que llevar las cuentas no te quite el sueño.</h1><p className="mt-7 max-w-lg text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">Inventario Familiar pone tus productos, tus ventas y lo importante del día en un solo lugar. Sin vueltas.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_5px_0_hsl(var(--primary-border))] hover:brightness-95" data-testid="link-landing-sign-up">Empezar ahora <ArrowRight size={17} /></Link><Link href="/sign-in" className="inline-flex min-h-12 items-center rounded-xl border bg-[hsl(var(--card)/.7)] px-5 text-sm font-bold hover:bg-[hsl(var(--card))]" data-testid="link-landing-login">Entrar a mi negocio</Link></div></section>
      <section className="rise-in rise-in-delay-2 relative"><div className="absolute -inset-4 rounded-[2rem] bg-[hsl(var(--primary)/.08)] rotate-3" /><div className="relative rounded-[1.5rem] border bg-[hsl(var(--card))] p-5 shadow-[0_20px_60px_hsl(var(--foreground)/.12)]"><div className="mb-5 flex items-center justify-between border-b pb-4"><div><p className="font-mono-app text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Resumen de hoy</p><p className="mt-1 font-display text-2xl font-bold">Hola, tu negocio</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--accent))]"><TrendingUp size={19} /></span></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-[hsl(var(--secondary)/.65)] p-4"><p className="text-xs text-[hsl(var(--muted-foreground))]">Ventas de hoy</p><p className="mt-2 font-mono-app text-2xl font-bold">$2,480</p><p className="mt-1 text-xs text-[hsl(var(--primary))]">+ 6 ventas</p></div><div className="rounded-xl bg-[hsl(var(--accent)/.7)] p-4"><p className="text-xs text-[hsl(var(--muted-foreground))]">Productos</p><p className="mt-2 font-mono-app text-2xl font-bold">38</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">4 por surtir</p></div></div><div className="mt-3 rounded-xl border p-4"><div className="mb-4 flex items-center justify-between"><p className="font-bold">Necesitan atención</p><span className="rounded-full bg-[hsl(var(--primary)/.12)] px-2 py-1 text-[10px] font-bold text-[hsl(var(--primary))]">4 productos</span></div>{['Jabón de avena','Velas de canela','Té de manzanilla'].map((name, i) => <div key={name} className="flex items-center gap-3 border-t py-3 text-sm"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--muted))] font-mono-app text-xs">{String(i + 1).padStart(2, '0')}</span><span className="flex-1 font-semibold">{name}</span><span className="font-mono-app text-xs text-[hsl(var(--primary))]">{i + 1} pzas.</span></div>)}</div></div></section>
    </main>
    <div className="relative mx-auto flex max-w-6xl flex-wrap gap-x-10 gap-y-3 border-t px-5 py-7 text-sm text-[hsl(var(--muted-foreground))] sm:px-8"><span className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Claro desde el primer día</span><span className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Hecho para trabajar rápido</span><span className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Tus datos, solo tuyos</span></div>
  </div>;
}

function Metric({ label, value, detail, icon: Icon, tone = 'cream' }: { label: string; value: string; detail?: string; icon: typeof Box; tone?: 'cream' | 'green' | 'orange' }) {
  const tones = { cream: 'bg-[hsl(var(--card))]', green: 'bg-[hsl(var(--accent)/.62)]', orange: 'bg-[hsl(var(--secondary)/.7)]' };
  return <div className={`rounded-2xl border p-5 ${tones[tone]} rise-in`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between"><p className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">{label}</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--background)/.6)] text-[hsl(var(--primary))]"><Icon size={18} /></span></div><p className="mt-4 font-mono-app text-3xl font-bold tracking-tight">{value}</p>{detail && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>;
}

function Dashboard() {
  const dashboard = useGetDashboard();
  const data = dashboard.data;
  const topRange = useMemo(() => {
    const now = new Date();
    return { from: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() };
  }, []);
  const topSales = useGetSalesReport(topRange);
  const topProducts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of topSales.data?.sales ?? []) for (const item of s.items) counts.set(item.productName, (counts.get(item.productName) ?? 0) + item.quantity);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [topSales.data]);
  const [debtModal, setDebtModal] = useState(false);
  const { activeCompany } = useCompany();
  return <Shell><PageHeading eyebrow="Resumen del negocio" title={activeCompany?.name ?? 'Tu negocio'} description="Esto es lo que está pasando con tu negocio hoy." action={<Link href="/app/venta" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_4px_0_hsl(var(--primary-border))]" data-testid="link-dashboard-sale"><ShoppingCart size={18} /> Registrar venta</Link>} />
    {dashboard.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((n) => <div key={n} className="h-36 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />)}</div> :
      dashboard.isError ? <StatusMessage text="No pudimos cargar tu resumen. Revisa tu conexión e inténtalo de nuevo." onRetry={() => dashboard.refetch()} /> :
        <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Productos" value={String(data?.productCount ?? 0)} detail={`${data?.totalUnits ?? 0} unidades en existencia`} icon={Box} /><Metric label="Ventas de hoy" value={money(data?.todaySalesTotal ?? 0)} detail={`${data?.todaySalesCount ?? 0} ventas registradas`} icon={CircleDollarSign} tone="green" /><Metric label="Valor para vender" value={money(data?.inventorySaleValue ?? 0)} detail="Si vendes todo tu inventario" icon={TrendingUp} tone="orange" /><Metric label="Ganancia posible" value={money(data?.potentialProfit ?? 0)} detail="Antes de gastos adicionales" icon={Sparkles} /><div className="rounded-2xl border bg-[hsl(var(--secondary)/.7)] p-5 rise-in" data-testid="metric-deuda-moises-david"><div className="flex items-start justify-between"><p className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">Deuda Moises David</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--background)/.6)] text-[hsl(var(--primary))]"><Wallet size={18} /></span></div><p className="mt-4 font-mono-app text-3xl font-bold tracking-tight">{money(data?.deudaMoisesDavid ?? 0)}</p>{data?.canEditDeudaMoises ? <button onClick={() => setDebtModal(true)} className="mt-2 text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-2" data-testid="button-edit-debt">Actualizar deuda</button> : <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Valor pendiente</p>}</div></div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><section className="rounded-2xl border bg-[hsl(var(--card))] p-6"><div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Acciones rápidas</p><h2 className="mt-2 font-display text-2xl font-bold">¿Qué necesitas hacer?</h2></div><ClipboardList className="text-[hsl(var(--primary))]" size={22} /></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href="/app/productos" className="group flex items-center gap-4 rounded-xl border p-4 transition-colors hover:border-[hsl(var(--primary)/.5)] hover:bg-[hsl(var(--secondary)/.35)]" data-testid="link-quick-products"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Box size={21} /></span><span className="flex-1"><b className="block text-sm">Ver productos</b><small className="text-xs text-[hsl(var(--muted-foreground))]">Consulta y actualiza existencias</small></span><ArrowRight size={16} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" /></Link><Link href="/app/reportes" className="group flex items-center gap-4 rounded-xl border p-4 transition-colors hover:border-[hsl(var(--primary)/.5)] hover:bg-[hsl(var(--secondary)/.35)]" data-testid="link-quick-reports"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--accent))]"><BarChart3 size={21} /></span><span className="flex-1"><b className="block text-sm">Ver reportes</b><small className="text-xs text-[hsl(var(--muted-foreground))]">Mira cómo va tu negocio</small></span><ArrowRight size={16} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" /></Link><Link href="/app/venta" className="group flex items-center gap-4 rounded-xl border p-4 transition-colors hover:border-[hsl(var(--primary)/.5)] hover:bg-[hsl(var(--secondary)/.35)]" data-testid="link-quick-sale"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><ShoppingCart size={21} /></span><span className="flex-1"><b className="block text-sm">Registrar venta</b><small className="text-xs text-[hsl(var(--muted-foreground))]">Vende un producto en caja</small></span><ArrowRight size={16} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" /></Link><Link href="/app/cartera" className="group flex items-center gap-4 rounded-xl border p-4 transition-colors hover:border-[hsl(var(--primary)/.5)] hover:bg-[hsl(var(--secondary)/.35)]" data-testid="link-quick-cartera"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"><CreditCard size={21} /></span><span className="flex-1"><b className="block text-sm">Ver cartera</b><small className="text-xs text-[hsl(var(--muted-foreground))]">Créditos y abonos</small></span><ArrowRight size={16} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" /></Link></div></section>
            <section className="rounded-2xl border bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]"><div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] opacity-70">Últimos 15 días</p><h2 className="mt-2 font-display text-2xl font-bold">Top 10 más vendidos</h2></div><BarChart3 size={22} /></div><div className="mt-5">{topSales.isLoading ? <div className="grid gap-2">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-black/10" />)}</div> : topSales.isError ? <p className="rounded-xl bg-black/10 p-4 text-sm">No pudimos cargar las ventas.</p> : topProducts.length === 0 ? <p className="rounded-xl bg-black/10 p-4 text-sm">Aún no hay ventas en los últimos 15 días.</p> : <div className="grid gap-1">{topProducts.map(([name, qty], i) => <div key={name} className="flex items-center gap-3 rounded-xl p-2 text-sm hover:bg-black/10" data-testid={`top-product-${i + 1}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/10 font-mono-app text-xs">{String(i + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate font-semibold">{name}</span><span className="font-mono-app text-xs">{qty} {qty === 1 ? 'unid' : 'unids'}</span></div>)}</div>}</div></section></div></>}
    {debtModal && <DebtModal onClose={() => setDebtModal(false)} />}
  </Shell>;
}

function DebtModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const update = useUpdateDeudaMoises(); const [value, setValue] = useState(''); const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => { e.preventDefault(); const v = Number(value); if (value.trim() === '' || !Number.isFinite(v) || v < 0) { setError('Escribe un valor válido.'); return; } setError(''); update.mutate({ data: { value: Math.round(v) } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); onClose(); }, onError: () => setError('No se pudo guardar la deuda.') }); };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Deuda Moises David</p><h2 className="mt-1 font-display text-3xl font-bold">Actualizar deuda</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-debt-modal"><X size={20} /></button></div><div className="mt-6 grid gap-4"><Field label="Valor de la deuda" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" autoFocus data-testid="input-debt-value" /></div>{error && <p className="mt-4 text-sm text-[hsl(var(--destructive))]" data-testid="status-debt-error">{error}</p>}<div className="mt-7 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose} data-testid="button-cancel-debt">Cancelar</Button><Button type="submit" disabled={update.isPending} data-testid="button-save-debt">{update.isPending ? 'Guardando…' : 'Guardar'}</Button></div></form></div>;
}

function ProductModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const qc = useQueryClient(); const create = useCreateProduct(); const update = useUpdateProduct(); const del = useDeleteProduct();
  const allProducts = useListProducts();
  const [form, setForm] = useState({ name: product?.name || '', supplier: product?.supplier || '', category: product?.category || '', cost: String(product?.cost ?? ''), salePrice: String(product?.salePrice ?? ''), stock: product ? String(product.stock) : '', minimumStock: String(product?.minimumStock ?? 2) });
  const [error, setError] = useState('');
  const [newCategory, setNewCategory] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isEdit = !!product; const pending = create.isPending || update.isPending || del.isPending;
  const categories = useMemo(() => Array.from(new Set((allProducts.data || []).map((p) => p.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b)), [allProducts.data]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name.trim() || Number(form.salePrice) < 0 || Number(form.stock) < 0) { setError('Revisa los datos. El nombre y los precios son necesarios.'); return; } setError(''); const done = () => { qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); onClose(); }; const supplier = form.supplier.trim() || undefined; const category = form.category.trim() || undefined; if (isEdit) update.mutate({ id: product.id, data: { name: form.name.trim(), supplier, category, cost: Number(form.cost), salePrice: Number(form.salePrice), stock: Number(form.stock), minimumStock: Number(form.minimumStock) } }, { onSuccess: done, onError: () => setError('No se pudo guardar el producto.') }); else create.mutate({ data: { name: form.name.trim(), supplier, category, cost: Number(form.cost), salePrice: Number(form.salePrice), initialStock: Number(form.stock), minimumStock: Number(form.minimumStock) } }, { onSuccess: done, onError: () => setError('No se pudo crear el producto.') }); };
  const confirmDelete = () => del.mutate({ id: product!.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); onClose(); }, onError: () => { setConfirming(false); setError('No se pudo borrar el producto.'); } });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true"><form onSubmit={submit} className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-auto rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">{isEdit ? 'Editar producto' : 'Nuevo producto'}</p><h2 className="mt-1 font-display text-3xl font-bold">{isEdit ? product.name : 'Agrega un producto'}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-product-modal"><X size={20} /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Nombre del producto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Por ejemplo: Vela de canela" data-testid="input-product-name" /></div><SupplierField value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} testid="input-product-supplier" /><div className="grid gap-2"><div className="flex items-center justify-between"><label htmlFor="input-product-category" className="text-sm font-semibold">Categoría</label>{!newCategory && <button type="button" onClick={() => setNewCategory(true)} className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-2" data-testid="button-new-category">Nueva…</button>}</div>{newCategory ? <div className="relative"><input id="input-product-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Escribe la nueva categoría" className="h-11 w-full rounded-xl border bg-[hsl(var(--card))] px-3 pr-9 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="input-product-category" /><button type="button" onClick={() => { setNewCategory(false); setForm((f) => ({ ...f, category: product?.category || '' })); }} className="absolute right-3 top-3 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" title="Elegir de la lista" data-testid="button-back-category"><X size={16} /></button></div> : <div className="relative"><select id="input-product-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-11 w-full appearance-none rounded-xl border bg-[hsl(var(--card))] px-3 pr-9 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-product-category"><option value="">Sin categoría</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" /></div>}</div><Field label="Costo para ti" type="number" min="0" step="1" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.00" data-testid="input-product-cost" /><Field label="Precio de venta" type="number" min="0" step="1" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} placeholder="0.00" data-testid="input-product-sale-price" /><Field label={isEdit ? 'Existencia actual' : 'Existencia inicial'} type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" data-testid="input-product-stock" /><Field label="Avisarme cuando queden" type="number" min="0" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} placeholder="2" data-testid="input-product-minimum-stock" /></div>{error && <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" data-testid="status-product-error">{error}</p>}<div className="mt-7 flex flex-wrap justify-end gap-3">{isEdit && <Button type="button" variant="danger" onClick={() => setConfirming(true)} data-testid="button-delete-product"><Trash2 size={16} /> Borrar producto</Button>}<Button type="button" variant="ghost" onClick={onClose} data-testid="button-cancel-product">Cancelar</Button><Button type="submit" disabled={pending} data-testid="button-save-product">{pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}</Button></div></form>{confirming && product && <div className="fixed inset-0 z-[60] grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true"><div className="w-full max-w-sm rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><h3 className="font-display text-2xl font-bold">¿Borrar este producto?</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Se eliminará <b>{product.name}</b> y su historial de inventario. Esta acción no se puede deshacer.</p><div className="mt-7 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setConfirming(false)} data-testid="button-cancel-delete-product">Cancelar</Button><Button type="button" variant="danger" onClick={confirmDelete} disabled={del.isPending} data-testid="button-confirm-delete-product">{del.isPending ? 'Borrando…' : 'Borrar'}</Button></div></div></div>}</div>;
}

function InventoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient(); const add = useAddInventory(); const [quantity, setQuantity] = useState(''); const [note, setNote] = useState(''); const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (Number(quantity) < 1) { setError('Escribe una cantidad de al menos 1.'); return; } add.mutate({ id: product.id, data: { quantity: Number(quantity), note: note.trim() || undefined } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); onClose(); }, onError: () => setError('No se pudo actualizar el inventario.') }); };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Agregar inventario</p><h2 className="mt-1 font-display text-3xl font-bold">{product.name}</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Ahora tienes <b>{product.stock} unidades</b>.</p></div><button type="button" onClick={onClose} className="p-2" data-testid="button-close-inventory-modal"><X size={20} /></button></div><div className="mt-6 grid gap-4"><Field label="¿Cuántas unidades llegaron?" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" autoFocus data-testid="input-inventory-quantity" /><Field label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: compra del martes" data-testid="input-inventory-note" /></div>{error && <p className="mt-4 text-sm text-[hsl(var(--destructive))]" data-testid="status-inventory-error">{error}</p>}<div className="mt-7 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose} data-testid="button-cancel-inventory">Cancelar</Button><Button type="submit" disabled={add.isPending} data-testid="button-save-inventory">{add.isPending ? 'Actualizando…' : 'Sumar al inventario'}</Button></div></form></div>;
}

function Products() {
  const products = useListProducts(); const supplierList = useListSuppliers(); const qc = useQueryClient(); const { activeCompany } = useCompany(); const isPrema = activeCompany?.id === 2; const isTere = activeCompany?.id === 1; const [search, setSearch] = useState(''); const [sort, setSort] = useState('name'); const [supplier, setSupplier] = useState('all'); const [category, setCategory] = useState('all'); const [status, setStatus] = useState('all'); const [modal, setModal] = useState<'new' | Product | null>(null); const [inventory, setInventory] = useState<Product | null>(null);
  const suppliers = useMemo(() => supplierOptions(activeCompany?.id, (supplierList.data || []).map((s) => s.name), (products.data || []).map((p) => p.supplier)), [supplierList.data, products.data, activeCompany]);
  const categories = useMemo(() => Array.from(new Set((products.data || []).map((p) => p.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b)), [products.data]);
  const list = useMemo(() => [...(products.data || [])].filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) && (supplier === 'all' || p.supplier === supplier) && (category === 'all' || p.category === category) && (status === 'all' || (status === 'low' ? p.stock <= p.minimumStock : p.stock > p.minimumStock))).sort((a, b) => sort === 'stock' ? a.stock - b.stock : sort === 'price' ? b.salePrice - a.salePrice : a.name.localeCompare(b.name)), [products.data, search, sort, supplier, category, status]);
  return <Shell><PageHeading eyebrow="Catálogo" title="Productos" action={<Button onClick={() => setModal('new')} className="min-h-[28px] px-2.5 text-sm" data-testid="button-new-product"><Plus size={14} /> Nuevo producto</Button>} />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5"><span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Buscar</span><span className="relative"><Search size={18} className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar un producto..." className="h-11 w-full rounded-xl border bg-[hsl(var(--card))] pl-10 pr-4 outline-none focus:border-[hsl(var(--primary))]" data-testid="input-search-products" /></span></label><div className="grid gap-1.5 sm:w-44"><span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Proveedor</span><label className="relative"><select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-11 w-full appearance-none rounded-xl border bg-[hsl(var(--card))] pl-4 pr-10 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-supplier-products"><option value="all">Todos</option>{suppliers.map((s) => <option key={s} value={s}>{s}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" /></label></div>{!isTere && <div className="grid gap-1.5 sm:w-44"><span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Categoría</span><label className="relative"><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 w-full appearance-none rounded-xl border bg-[hsl(var(--card))] pl-4 pr-10 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-category-products"><option value="all">Todas</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" /></label></div>}{!isPrema && <div className="grid gap-1.5 sm:w-40"><span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Estado</span><label className="relative"><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 w-full appearance-none rounded-xl border bg-[hsl(var(--card))] pl-4 pr-10 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-status-products"><option value="all">Todos</option><option value="ok">En existencia</option><option value="low">Por surtir</option></select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" /></label></div>}<div className="grid gap-1.5 sm:w-48"><span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Ordenar</span><label className="relative"><select value={sort} onChange={(e) => setSort(e.target.value)} className="h-11 w-full appearance-none rounded-xl border bg-[hsl(var(--card))] pl-4 pr-10 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-sort-products"><option value="name">Nombre</option><option value="stock">Menos existencia</option><option value="price">Precio mayor</option></select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" /></label></div>     </div>
     {!products.isLoading && !products.isError && <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]" data-testid="text-product-count">{list.length} {list.length === 1 ? 'producto' : 'productos'}{search || supplier !== 'all' || category !== 'all' || status !== 'all' ? ` de ${(products.data || []).length}` : ''}</p>}
     {products.isLoading ? <div className="grid gap-3">{[1, 2, 3, 4].map((n) => <div key={n} className="h-24 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />)}</div> :  products.isError ? <StatusMessage text="No pudimos cargar los productos." onRetry={() => products.refetch()} /> : list.length === 0 ? <StatusMessage type="empty" text={search || supplier !== 'all' || category !== 'all' || status !== 'all' ? 'No encontramos productos con esos filtros.' : 'Todavía no tienes productos. Crea el primero para empezar.'} /> : <div className="overflow-hidden rounded-2xl border bg-[hsl(var(--card))]"><div className={`hidden gap-4 border-b bg-[hsl(var(--muted)/.45)] px-5 py-3 font-mono-app text-sm font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] md:grid ${isPrema ? 'grid-cols-[1fr_110px_110px_150px]' : 'grid-cols-[1fr_110px_110px_130px_150px]'}`}><span>Producto</span><span>Inventario</span><span>Precio</span>{!isPrema && <span>Estado</span>}<span /></div>{list.map((p) => {
        const low = p.stock <= p.minimumStock;
        const avatarClass = low ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--accent))]';
        const badgeClass = low ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--accent)/.7)] text-[hsl(var(--accent-foreground))]';
        return <div key={p.id} className={`border-b p-5 last:border-0 md:grid md:items-center md:gap-4 md:px-5 md:py-4 ${isPrema ? 'md:grid-cols-[1fr_110px_110px_150px]' : 'md:grid-cols-[1fr_110px_110px_130px_150px]'}`} data-testid={`row-product-${p.id}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-mono-app text-xs font-bold ${avatarClass}`}>{p.name.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-normal break-words font-bold md:truncate">{[p.name, p.content].filter(Boolean).join(' x ')}</p>
              {p.supplier && <p className="whitespace-normal break-words text-sm font-semibold text-[hsl(var(--primary))] md:truncate">{p.supplier}</p>}
              {p.category && <p className="whitespace-normal break-words text-xs font-semibold text-[hsl(var(--muted-foreground))] md:truncate">{p.category}</p>}
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Costo {money(p.cost)}</p>
            </div>
            {!isPrema && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold md:hidden ${badgeClass}`}>{low ? 'Por surtir' : 'En stock'}</span>}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[hsl(var(--muted)/.4)] px-4 py-3 md:hidden">
            <div className="flex items-center gap-6">
              <div>
                <p className="font-mono-app text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Existencia</p>
                <p className="mt-0.5 text-lg font-bold">{p.stock}</p>
              </div>
            <div>
              <p className="font-mono-app text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Precio</p>
              <p className="mt-0.5 text-lg">{money(p.salePrice)}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:hidden">
          <Button variant="secondary" className="min-h-[26px] px-1.5 text-sm" onClick={() => setInventory(p)} data-testid={`button-add-inventory-${p.id}`}><PackagePlus size={13} /> Agregar</Button>
          <Button variant="ghost" className="min-h-[26px] px-1.5 text-sm !bg-[hsl(var(--muted))] !text-[hsl(var(--foreground))]" onClick={() => setModal(p)} data-testid={`button-edit-product-${p.id}`}><Pencil size={13} /> Editar</Button>
        </div>
          <div className="hidden md:block"><span className="text-xl font-bold">{p.stock}</span></div>
          <p className="hidden text-xl md:block">{money(p.salePrice)}</p>
          {!isPrema && <span className={`hidden w-fit rounded-full px-2.5 py-1 text-xs font-bold md:block ${badgeClass}`}>{low ? 'Por surtir' : 'En existencia'}</span>}
          <div className="hidden flex-col gap-2 md:flex">
            <Button variant="secondary" className="w-full min-h-[26px] px-1.5 text-sm" onClick={() => setInventory(p)} data-testid={`button-add-inventory-${p.id}`}><PackagePlus size={13} /> Agregar</Button>
            <Button variant="ghost" className="w-full min-h-[26px] px-1.5 text-sm !bg-[hsl(var(--muted))] !text-[hsl(var(--foreground))]" onClick={() => setModal(p)} data-testid={`button-edit-product-${p.id}`}><Pencil size={13} /> Editar</Button>
          </div>
        </div>;
      })}</div>}
    {modal && <ProductModal product={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />}{inventory && <InventoryModal product={inventory} onClose={() => setInventory(null)} />}
  </Shell>;
}

function SalePage() {
  const products = useListProducts(); const qc = useQueryClient(); const sale = useCreateSale(); const { activeCompany } = useCompany(); const allowNegative = !!activeCompany?.allowNegativeStock; const isPrema = activeCompany?.id === 2; const [items, setItems] = useState<{ productId: number; quantity: number; unitPrice: number }[]>([]); const [selected, setSelected] = useState(''); const [query, setQuery] = useState(''); const [open, setOpen] = useState(false); const [quantity, setQuantity] = useState('1'); const [paymentMethod, setPaymentMethod] = useState('Efectivo'); const [notes, setNotes] = useState(''); const [clientName, setClientName] = useState(''); const [clientPhone, setClientPhone] = useState(''); const [error, setError] = useState(''); const [result, setResult] = useState<Sale | null>(null);
  const chosen = products.data?.filter((p) => items.some((i) => i.productId === p.id)) || [];
  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const matches = useMemo(() => (products.data || []).filter((p) => (allowNegative || p.stock > 0) && (p.name.toLowerCase().includes(query.trim().toLowerCase()) || (p.supplier || '').toLowerCase().includes(query.trim().toLowerCase()))), [products.data, query, allowNegative]);
  const addItem = () => { const id = Number(selected); const qty = Number(quantity); const p = products.data?.find((x) => x.id === id); if (!p || qty < 1) return; const existing = items.find((i) => i.productId === id); const currentInCart = existing?.quantity || 0; if (!allowNegative && currentInCart + qty > p.stock) { setError(`No hay suficientes unidades de ${p.name}. Solo quedan ${p.stock}.`); return; } setItems(existing ? items.map((i) => i.productId === id ? { ...i, quantity: i.quantity + qty } : i) : [...items, { productId: id, quantity: qty, unitPrice: p.salePrice }]); setSelected(''); setQuery(''); setQuantity('1'); setError(''); };
  const setLine = (productId: number, patch: Partial<{ quantity: number; unitPrice: number }>) => setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, ...patch } : i));
  const submit = () => { if (!items.length) { setError('Agrega al menos un producto para registrar la venta.'); return; } sale.mutate({ data: { items, paymentMethod, notes: notes.trim() || undefined, clientName: clientName.trim() || undefined, clientPhone: clientPhone.trim() || undefined } }, { onSuccess: (created) => { setResult(created); setItems([]); setNotes(''); setClientName(''); setClientPhone(''); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getListSalesQueryKey() }); }, onError: () => setError('No se pudo registrar la venta. Revisa las existencias.') }); };
  if (result) return <Shell><div className="mx-auto max-w-xl py-10 text-center"><span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"><Check size={38} /></span><p className="mt-7 font-mono-app text-[11px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Venta registrada · Venta #{result.saleNumber}</p><h1 className="mt-2 font-display text-5xl font-bold">Listo, quedó anotada.</h1><p className="mt-4 text-[hsl(var(--muted-foreground))]">Se actualizaron las existencias de tus productos.</p><div className="mt-8 rounded-2xl border bg-[hsl(var(--card))] p-5 text-left"><div className="flex justify-between border-b pb-4 text-sm"><span className="text-[hsl(var(--muted-foreground))]">Total de la venta</span><strong className="font-mono-app text-xl">{money(result.total)}</strong></div><div className="mt-4 grid gap-2">{result.items.map((item) => <div key={item.productId} className="flex justify-between text-sm"><span>{item.quantity} × {item.productName}</span><span className="font-mono-app">{money(item.subtotal)}</span></div>)}</div><div className="mt-4 grid gap-2 border-t pt-4 text-sm"><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Método de pago</span><strong>{result.paymentMethod || 'No indicado'}</strong></div>{result.notes && <div className="rounded-lg bg-[hsl(var(--muted)/.5)] p-3 text-sm"><span className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Notas</span>{result.notes}</div>}</div></div><div className="mt-7 flex justify-center gap-3"><Button variant="secondary" onClick={() => setResult(null)} data-testid="button-new-sale">Registrar otra</Button><Link href="/app" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold text-[hsl(var(--primary))]" data-testid="link-sale-dashboard">Volver al inicio <ArrowRight size={16} /></Link></div></div></Shell>;
  return <Shell><PageHeading eyebrow="Caja" title="Registrar venta" description="Agrega lo que se llevó tu cliente y confirma al final." /><div className="grid gap-6 lg:grid-cols-[1fr_370px]"><section className="rounded-2xl border bg-[hsl(var(--card))] p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-[1fr_150px_auto] sm:items-end"><label className="grid gap-1.5 text-sm font-semibold">Producto<div className="relative"><input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Buscar un producto..." className="h-12 w-full rounded-xl border bg-[hsl(var(--background))] px-3 pr-10 outline-none focus:border-[hsl(var(--primary))]" data-testid="input-sale-search" /><ChevronDown size={16} className={`pointer-events-none absolute right-3 top-4 text-[hsl(var(--muted-foreground))] transition-transform ${open ? 'rotate-180' : ''}`} />{open && <ul className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-xl border bg-[hsl(var(--card))] p-1 shadow-xl">{matches.slice(0, 20).map((p) => <li key={p.id}><button type="button" onClick={() => { setSelected(String(p.id)); setQuery(p.name); setOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))]" data-testid={`option-sale-product-${p.id}`}>{isPrema ? `${p.name}${p.content ? ` · ${p.content}` : ''}` : `${p.name} · ${p.stock > 0 ? `${p.stock} disponibles` : allowNegative ? 'sin existencias' : `${p.stock} disponibles`}`}</button></li>)}{!matches.length && <li className="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">No encontramos productos con ese nombre.</li>}</ul>}</div></label><Field label="Cantidad" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-sale-quantity" /><Button type="button" onClick={addItem} className="sm:mb-0" data-testid="button-add-sale-item"><Plus size={18} /> Agregar</Button></div>{error && <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" data-testid="status-sale-error">{error}</p>}<div className="mt-8 grid gap-4 border-t pt-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-semibold">Método de pago<div className="relative"><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-12 w-full appearance-none rounded-xl border bg-[hsl(var(--background))] px-3 pr-10 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-sale-payment-method">{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-4 text-[hsl(var(--muted-foreground))]" /></div></label>{paymentMethod === 'Crédito' && <><label className="grid gap-1.5 text-sm font-semibold">Nombre Cliente<div className="relative"><input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre del cliente (opcional)" className="h-12 w-full rounded-xl border bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-sale-client-name" /></div></label><label className="grid gap-1.5 text-sm font-semibold">Teléfono<div className="relative"><input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Teléfono del cliente (opcional)" className="h-12 w-full rounded-xl border bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-sale-client-phone" /></div></label></>}<label className="grid gap-1.5 text-sm font-semibold">Notas<div className="relative"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observaciones de la venta (opcional)" className="h-12 w-full resize-none rounded-xl border bg-[hsl(var(--background))] px-3 py-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-sale-notes" /></div></label></div><div className="mt-8 border-t pt-5"><p className="mb-3 font-mono-app text-xs uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Productos de esta venta</p>{!items.length ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed p-5 text-center"><div><ShoppingBasket size={25} className="mx-auto text-[hsl(var(--muted-foreground))]" /><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Aún no hay productos.<br />Elige uno arriba para comenzar.</p></div></div> : <div className="grid gap-3">{items.map((item) => { const p = products.data?.find((x) => x.id === item.productId); return <div key={item.productId} className="rounded-xl bg-[hsl(var(--muted)/.55)] p-3" data-testid={`row-sale-item-${item.productId}`}><div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">{p?.name}{p?.content ? ` · ${p.content}` : ''}</span><button onClick={() => setItems(items.filter((x) => x.productId !== item.productId))} className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--card))]" data-testid={`button-remove-sale-item-${item.productId}`}><X size={17} /></button></div><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"><label className="flex items-center gap-2 text-sm font-semibold">Cant.<input type="number" min="1" value={item.quantity} onChange={(e) => setLine(item.productId, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="h-11 w-20 rounded-xl border bg-[hsl(var(--card))] px-2 text-center text-base font-bold outline-none focus:border-[hsl(var(--primary))]" data-testid={`input-sale-line-qty-${item.productId}`} /></label><label className="flex items-center gap-2 text-sm font-semibold">P. unit.<input type="number" min="0" step="1" value={item.unitPrice} onChange={(e) => setLine(item.productId, { unitPrice: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="h-11 w-28 rounded-xl border bg-[hsl(var(--card))] px-2 text-right text-base font-bold outline-none focus:border-[hsl(var(--primary))]" data-testid={`input-sale-line-price-${item.productId}`} /></label><span className="ml-auto font-mono-app text-lg font-bold sm:text-xl">{money(item.unitPrice * item.quantity)}</span></div></div>})}</div>}</div></section><aside className="h-fit rounded-2xl bg-[hsl(var(--sidebar))] p-6 text-[hsl(var(--sidebar-foreground))]"><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--sidebar-primary))]">Resumen</p><h2 className="mt-2 font-display text-2xl font-bold">Total a cobrar</h2><p className="mt-6 font-mono-app text-5xl font-bold text-[hsl(var(--sidebar-primary))]">{money(total)}</p><p className="mt-2 text-sm text-[hsl(var(--sidebar-foreground)/.6)]">{items.reduce((sum, i) => sum + i.quantity, 0)} productos en total</p><Button className="mt-7 w-full bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]" onClick={submit} disabled={sale.isPending || !items.length} data-testid="button-confirm-sale">{sale.isPending ? 'Registrando…' : 'Confirmar venta'} <ArrowRight size={17} /></Button><p className="mt-4 text-center text-xs text-[hsl(var(--sidebar-foreground)/.5)]">Al confirmar, se descuentan las existencias automáticamente.</p></aside></div></Shell>;
}

function PurchaseModal({ onClose }: { onClose: () => void }) {
  const products = useListProducts(); const qc = useQueryClient(); const create = useCreatePurchase();
  const [supplier, setSupplier] = useState(''); const [invoice, setInvoice] = useState(''); const [date, setDate] = useState('');
  const [items, setItems] = useState<{ productId: number; quantity: number; unitCost: number }[]>([]);
  const [selected, setSelected] = useState(''); const [query, setQuery] = useState(''); const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('1'); const [unitCost, setUnitCost] = useState(''); const [error, setError] = useState('');
  const matches = useMemo(() => (products.data || []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()) || (p.supplier || '').toLowerCase().includes(query.trim().toLowerCase())), [products.data, query]);
  const total = items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0);
  const addItem = () => {
    const id = Number(selected); const qty = Number(quantity); const cost = Number(unitCost);
    const p = products.data?.find((x) => x.id === id);
    if (!p || qty < 1 || cost < 0) { setError('Elige un producto y escribe cantidad y costo válidos.'); return; }
    const existing = items.find((i) => i.productId === id);
    setItems(existing ? items.map((i) => i.productId === id ? { ...i, quantity: i.quantity + qty, unitCost: cost } : i) : [...items, { productId: id, quantity: qty, unitCost: cost }]);
    setSelected(''); setQuery(''); setQuantity('1'); setUnitCost(''); setError('');
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!items.length) { setError('Agrega al menos un producto a la compra.'); return; }
    const data: PurchaseInput = { items, supplier: supplier.trim() || undefined, invoiceNumber: invoice.trim() || undefined, purchaseDate: date ? new Date(date + 'T12:00:00').toISOString() : undefined };
    create.mutate({ data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListPurchasesQueryKey() }); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); onClose(); }, onError: () => setError('No se pudo registrar la compra.') });
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true"><form onSubmit={submit} className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-auto rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Entrada de mercancía</p><h2 className="mt-1 font-display text-3xl font-bold">Nueva compra</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">El stock se sumará automáticamente a cada producto.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-purchase-modal"><X size={20} /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><SupplierField value={supplier} onChange={setSupplier} testid="input-purchase-supplier" /><Field label="N.º de factura" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Opcional" data-testid="input-purchase-invoice" /><Field label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-purchase-date" /></div><div className="mt-5 rounded-xl border bg-[hsl(var(--muted)/.35)] p-4"><div className="grid gap-3 sm:grid-cols-[1fr_100px_130px_auto] sm:items-end"><label className="grid gap-1.5 text-sm font-semibold">Producto<div className="relative"><input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Buscar producto..." className="h-11 w-full rounded-xl border bg-[hsl(var(--card))] px-3 pr-9 outline-none focus:border-[hsl(var(--primary))]" data-testid="input-purchase-search" /><ChevronDown size={16} className={`pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))] transition-transform ${open ? 'rotate-180' : ''}`} />{open && <ul className="absolute z-10 mt-2 max-h-56 w-full overflow-auto rounded-xl border bg-[hsl(var(--card))] p-1 shadow-xl">{matches.slice(0, 20).map((p) => <li key={p.id}><button type="button" onClick={() => { setSelected(String(p.id)); setQuery(p.name); setOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))]" data-testid={`option-purchase-product-${p.id}`}>{p.name} · {p.stock} en stock</button></li>)}{!matches.length && <li className="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">No encontramos productos con ese nombre.</li>}</ul>}</div></label><Field label="Cantidad" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-purchase-quantity" /><Field label="Costo unitario" type="number" min="0" step="1" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" data-testid="input-purchase-unit-cost" /><Button type="button" onClick={addItem} className="sm:mb-0" data-testid="button-add-purchase-item"><Plus size={18} /> Agregar</Button></div>{items.length > 0 && <div className="mt-4 divide-y rounded-xl bg-[hsl(var(--card))] px-3">{items.map((item, idx) => { const p = products.data?.find((x) => x.id === item.productId); return <div key={item.productId} className="flex items-center gap-3 py-2.5 text-sm" data-testid={`purchase-item-${item.productId}`}><span className="min-w-0 flex-1 truncate font-semibold">{p?.name || `#${item.productId}`}</span><span className="font-mono-app text-xs text-[hsl(var(--muted-foreground))]">× {item.quantity}</span><span className="font-mono-app font-bold">{money(item.unitCost * item.quantity)}</span><button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="rounded-lg p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]" title="Quitar" data-testid={`button-remove-purchase-item-${item.productId}`}><Trash2 size={14} /></button></div>; })}</div>}</div>{error && <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" data-testid="status-purchase-error">{error}</p>}<div className="mt-6 flex items-center justify-between rounded-2xl bg-[hsl(var(--secondary)/.6)] px-5 py-4"><span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">Total de la compra</span><span className="font-mono-app text-2xl font-bold">{money(total)}</span></div><div className="mt-6 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose} data-testid="button-cancel-purchase">Cancelar</Button><Button type="submit" disabled={create.isPending} data-testid="button-save-purchase">{create.isPending ? 'Registrando…' : 'Registrar compra'}</Button></div></form></div>;
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const imp = useImportPurchases();
  const [supplier, setSupplier] = useState(''); const [invoice, setInvoice] = useState(''); const [text, setText] = useState('');
  const [error, setError] = useState(''); const [result, setResult] = useState<PurchaseImportResult | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [product, quantity, unitCost] = line.split(/[;,]/).map((x) => x.trim());
      return { product, quantity: Number(quantity), unitCost: Number(unitCost) };
    });
    if (!rows.length) { setError('Pega al menos una línea con: producto;cantidad;costo.'); return; }
    imp.mutate({ data: { rows, supplier: supplier.trim() || undefined, invoiceNumber: invoice.trim() || undefined } }, { onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: getListPurchasesQueryKey() }); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); }, onError: () => setError('No se pudo importar. Revisa el formato: producto;cantidad;costo por línea.') });
  };
  if (result) return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"><Check size={26} /></span><h3 className="mt-4 text-center font-display text-2xl font-bold">Importación lista</h3><p className="mt-2 text-center text-sm text-[hsl(var(--muted-foreground))]">Se registró una compra por <b>{money(result.purchase.total)}</b> con {result.purchase.totalItems} unidades.</p><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[hsl(var(--secondary)/.6)] p-3"><p className="text-2xl font-bold">{result.created}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">nuevos</p></div><div className="rounded-xl bg-[hsl(var(--accent)/.5)] p-3"><p className="text-2xl font-bold">{result.matched}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">existentes</p></div><div className="rounded-xl bg-[hsl(var(--muted))] p-3"><p className="text-2xl font-bold">{result.skipped}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">omitidas</p></div></div><div className="mt-6 flex justify-end"><Button type="button" onClick={onClose} data-testid="button-import-done">Listo</Button></div></div></div>;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true"><form onSubmit={submit} className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-auto rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Importar desde CSV</p><h2 className="mt-1 font-display text-3xl font-bold">Cargar compra</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-import-modal"><X size={20} /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Proveedor" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nombre del proveedor" data-testid="input-import-supplier" /><Field label="N.º de factura" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Opcional" data-testid="input-import-invoice" /></div><div className="mt-4"><Field label="Filas del archivo (producto;cantidad;costo por línea)" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Vela de canela;10;4500\nJabón de avena;5;6200'} data-testid="textarea-import-rows" /></div><p className="mt-3 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Upload size={14} /> Los productos nuevos se crean automáticamente; los existentes se actualizan.</p>{error && <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" data-testid="status-import-error">{error}</p>}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose} data-testid="button-cancel-import">Cancelar</Button><Button type="submit" disabled={imp.isPending} data-testid="button-submit-import">{imp.isPending ? 'Importando…' : 'Importar compra'}</Button></div></form></div>;
}

function Purchases() {
  const [period, setPeriod] = useState<'today' | 'last7' | 'thisMonth' | 'previousMonth' | 'all'>('all');
  const purchases = useListPurchases({ period }); const qc = useQueryClient(); const del = useDeletePurchase();
  const [modal, setModal] = useState(false); const [importModal, setImportModal] = useState(false); const [expanded, setExpanded] = useState<number | null>(null); const [confirm, setConfirm] = useState<Purchase | null>(null);
  const totalSpent = (purchases.data || []).reduce((sum, p) => sum + p.total, 0);
  const totalUnits = (purchases.data || []).reduce((sum, p) => sum + p.totalItems, 0);
  return <Shell><PageHeading eyebrow="Surtir inventario" title="Compras" description="Registra las entradas de mercancía y el stock se actualiza solo." action={<><Button variant="secondary" className="mr-2" onClick={() => setImportModal(true)} data-testid="button-import-purchases"><Upload size={16} /> Importar CSV</Button><Button onClick={() => setModal(true)} data-testid="button-new-purchase"><Plus size={16} /> Nueva compra</Button></>} />
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border bg-[hsl(var(--card))] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3 text-sm"><span className="font-semibold text-[hsl(var(--muted-foreground))]">Invertido:</span><strong className="font-mono-app text-lg">{money(totalSpent)}</strong><span className="hidden h-5 w-px bg-[hsl(var(--muted))] sm:block" /><span className="text-[hsl(var(--muted-foreground))]">{totalUnits} unidades entradas</span></div><label className="relative"><select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="h-10 w-full appearance-none rounded-lg border bg-[hsl(var(--background))] px-3 pr-8 text-sm font-bold outline-none sm:w-48" data-testid="select-purchase-period"><option value="today">Hoy</option><option value="last7">Últimos 7 días</option><option value="thisMonth">Este mes</option><option value="previousMonth">Mes pasado</option><option value="all">Todo el tiempo</option></select><ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-3" /></label></div>
    {purchases.isLoading ? <div className="grid gap-3">{[1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />)}</div> : purchases.isError ? <StatusMessage text="No pudimos cargar las compras." onRetry={() => purchases.refetch()} /> : !purchases.data?.length ? <StatusMessage type="empty" text="Todavía no hay compras registradas. Crea la primera para surtir tu inventario." /> : <div className="grid gap-3">{purchases.data.map((purchase) => <div key={purchase.id} className="overflow-hidden rounded-2xl border bg-[hsl(var(--card))]" data-testid={`purchase-${purchase.id}`}><div className="flex flex-wrap items-center gap-3 px-5 py-4"><button type="button" onClick={() => setExpanded(expanded === purchase.id ? null : purchase.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><ShoppingBasket size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{purchase.supplier || 'Compra sin proveedor'}</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{dateLabel(purchase.date)}{purchase.invoiceNumber ? ` · Factura ${purchase.invoiceNumber}` : ''} · {purchase.totalItems} unidades</span></span><ChevronDown size={16} className={`shrink-0 text-[hsl(var(--muted-foreground))] transition-transform ${expanded === purchase.id ? 'rotate-180' : ''}`} /></button><span className="font-mono-app text-lg font-bold">{money(purchase.total)}</span><button type="button" onClick={() => setConfirm(purchase)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]" title="Anular compra" data-testid={`button-delete-purchase-${purchase.id}`}><Trash2 size={16} /></button></div>{expanded === purchase.id && <div className="border-t bg-[hsl(var(--muted)/.3)] px-5 py-3">{purchase.items.map((item) => <div key={item.productId} className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="min-w-0 flex-1 truncate text-[hsl(var(--muted-foreground))]">{item.quantity} × {item.productName}</span><span className="font-mono-app font-semibold">{money(item.subtotal)}</span></div>)}</div>}</div>)}</div>}
    {modal && <PurchaseModal onClose={() => setModal(false)} />}{importModal && <ImportModal onClose={() => setImportModal(false)} />}
    {confirm && <div className="fixed inset-0 z-[60] grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true" data-testid="modal-confirm-delete-purchase"><div className="w-full max-w-sm rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><h3 className="font-display text-2xl font-bold">¿Anular esta compra?</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Se restará el inventario que entró con esta compra y desaparecerá del historial.</p><div className="mt-7 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setConfirm(null)} data-testid="button-cancel-delete-purchase">Cancelar</Button><Button type="button" variant="danger" onClick={() => del.mutate({ id: confirm.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListPurchasesQueryKey() }); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setConfirm(null); }, onError: () => setConfirm(null) })} disabled={del.isPending} data-testid="button-confirm-delete-purchase">{del.isPending ? 'Anulando…' : 'Anular'}</Button></div></div></div>}
  </Shell>;
}

function Reports() {
  const [period, setPeriod] = useState<'today' | 'last7' | 'thisMonth' | 'previousMonth' | 'all'>('today'); const [filter, setFilter] = useState<'all' | 'low' | 'empty'>('all'); const [day, setDay] = useState('');
  const salesParams = day ? { from: new Date(day + 'T00:00:00-05:00').toISOString(), to: new Date(day + 'T23:59:59.999-05:00').toISOString() } : { period }; const inventory = useGetInventoryReport({ filter }); const sales = useGetSalesReport(salesParams); const tabs = [{ value: 'all', label: 'Todo' }, { value: 'low', label: 'Por surtir' }, { value: 'empty', label: 'Agotados' }]; const qc = useQueryClient(); const deleteSale = useDeleteSale(); const { activeCompany } = useCompany(); const isPrema = activeCompany?.id === 2; const [confirmSale, setConfirmSale] = useState<number | null>(null);
  const dayHeader = (iso: string) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'));
  const byDay = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const s of sales.data?.sales ?? []) {
      const day = new Date(s.date).toLocaleDateString('en-CA');
      const list = map.get(day) ?? [];
      list.push(s);
      map.set(day, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [sales.data]);
  const exportRows = () => {
    const rows: (string | number)[][] = [['Fecha', 'Venta', 'Método de pago', 'Producto', 'Cantidad', 'Precio unitario', 'Total producto', 'Total venta']];
    for (const [day, daySales] of byDay) {
      const dayTotal = daySales.reduce((sum, s) => sum + s.total, 0);
      for (const s of daySales) {
        for (const item of s.items) rows.push([dayHeader(day), `Venta #${s.saleNumber}`, s.paymentMethod || '', item.productName, item.quantity, item.unitPrice, item.subtotal, '']);
        rows.push([dayHeader(day), `TOTAL Venta #${s.saleNumber}`, '', '', '', '', '', s.total]);
      }
      rows.push([dayHeader(day), 'TOTAL DÍA', '', '', '', '', '', dayTotal]);
    }
    const totals = new Map<string, number>();
    for (const [, daySales] of byDay) for (const s of daySales) { const m = s.paymentMethod || 'No indicado'; totals.set(m, (totals.get(m) ?? 0) + s.total); }
    if (totals.size) {
      rows.push([]);
      rows.push(['Cuadre de caja por método de pago']);
      rows.push(['Método de pago', '', '', '', '', '', '', 'Total']);
      const methods = [...PAYMENT_METHODS.filter((m) => totals.has(m)), ...[...totals.keys()].filter((m) => !PAYMENT_METHODS.includes(m))];
      let grandTotal = 0;
      for (const m of methods) { const t = totals.get(m) ?? 0; rows.push([m, '', '', '', '', '', '', t]); grandTotal += t; }
      rows.push(['TOTAL', '', '', '', '', '', '', grandTotal]);
    }
    return rows;
  };
  const downloadCsv = () => downloadBlob(new Blob([toCsv(exportRows())], { type: 'text/csv;charset=utf-8' }), `ventas-${day || period}-${new Date().toISOString().slice(0, 10)}.csv`);
  const downloadXlsx = () => buildXlsxBlob(exportRows()).then((blob) => downloadBlob(blob, `ventas-${day || period}-${new Date().toISOString().slice(0, 10)}.xlsx`));
  return <Shell><PageHeading eyebrow="Panorama" title="Reportes" description="Una lectura sencilla de cómo se mueve tu negocio." /><div className="mb-6 flex flex-col gap-3 rounded-2xl border bg-[hsl(var(--card))] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-1 rounded-xl bg-[hsl(var(--muted))] p-1">{tabs.map((tab) => <button key={tab.value} onClick={() => setFilter(tab.value as typeof filter)} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === tab.value ? 'bg-[hsl(var(--card))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid={`button-inventory-filter-${tab.value}`}>{tab.label}</button>)}</div><div className="flex flex-wrap items-center gap-2"><Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={downloadCsv} data-testid="button-export-csv"><Download size={15} /> CSV</Button><Button variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={downloadXlsx} data-testid="button-export-xlsx"><Download size={15} /> XLSX</Button><label className="relative"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-10 w-full appearance-none rounded-lg border bg-[hsl(var(--background))] px-3 text-sm font-bold outline-none sm:w-44" data-testid="input-report-day" /></label>{day && <button type="button" onClick={() => setDay('')} className="h-10 rounded-lg border px-2.5 text-xs font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-clear-report-day">Quitar día</button>}<label className="relative"><select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="h-10 w-full appearance-none rounded-lg border bg-[hsl(var(--background))] px-3 pr-8 text-sm font-bold outline-none sm:w-48" data-testid="select-report-period"><option value="today">Hoy</option><option value="last7">Últimos 7 días</option><option value="thisMonth">Este mes</option><option value="previousMonth">Mes pasado</option><option value="all">Todo el tiempo</option></select><ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-3" /></label></div></div>{inventory.isLoading || sales.isLoading ? <div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map((n) => <div key={n} className="h-32 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />)}</div> : inventory.isError || sales.isError ? <StatusMessage text="No pudimos generar tus reportes." onRetry={() => { inventory.refetch(); sales.refetch(); }} /> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Valor de costo" value={money(inventory.data?.totalCostValue || 0)} detail="Lo que has invertido" icon={CircleDollarSign} /><Metric label="Valor de venta" value={money(inventory.data?.totalSaleValue || 0)} detail="Si vendes existencias" icon={TrendingUp} tone="green" /><Metric label="Ventas registradas" value={String(sales.data?.saleCount || 0)} detail={`${sales.data?.itemCount || 0} productos vendidos`} icon={ShoppingCart} tone="orange" /><Metric label="Ganancia estimada" value={money(sales.data?.estimatedProfit || 0)} detail="En el periodo elegido" icon={Sparkles} /></div><section className="mt-6 rounded-2xl border bg-[hsl(var(--card))] p-6" data-testid="section-sales-by-day"><div className="flex items-center gap-3"><History size={20} className="text-[hsl(var(--primary))]" /><h2 className="font-display text-2xl font-bold">Ventas por día</h2></div>{!sales.data?.sales.length ? <p className="py-8 text-sm text-[hsl(var(--muted-foreground))]">Aún no hay ventas en este periodo.</p> : <div className="mt-4 divide-y">{byDay.map(([day, daySales]) => { const dayTotal = daySales.reduce((sum, s) => sum + s.total, 0); return <div key={day} className="py-4" data-testid={`report-day-${day}`}><div className="flex flex-wrap items-center gap-3"><span className="font-mono-app text-xs text-[hsl(var(--muted-foreground))]">{dayHeader(day)}</span><span className="text-xs text-[hsl(var(--muted-foreground))]">{daySales.length} {daySales.length === 1 ? 'venta' : 'ventas'}</span><span className="flex-1" /><span className="font-mono-app font-bold">Total: {money(dayTotal)}</span></div><div className="mt-3 divide-y rounded-xl bg-[hsl(var(--muted)/.4)] px-4">{daySales.map((s) => <div key={s.id} className="py-3" data-testid={`report-sale-${s.id}`}><div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-semibold">Venta #{s.saleNumber}</span><span className="text-xs text-[hsl(var(--muted-foreground))]">{s.totalItems} productos</span>{s.paymentMethod && <span className="rounded-full bg-[hsl(var(--accent)/.6)] px-2 py-1 text-xs font-bold">{s.paymentMethod}</span>}{isPrema && s.notes && <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]" data-testid={`report-sale-notes-${s.id}`}><span className="font-bold">Nota:</span> {s.notes}</span>}<span className="flex-1" /><span className="font-mono-app font-bold">{money(s.total)}</span><span className="hidden rounded-full bg-[hsl(var(--accent)/.6)] px-2 py-1 text-xs font-bold sm:inline">Ganancia {money(s.estimatedProfit)}</span><button type="button" onClick={() => setConfirmSale(s.id)} className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]" title="Borrar venta" data-testid={`button-delete-sale-${s.id}`}><Trash2 size={15} /></button></div><div className="mt-3 rounded-xl bg-[hsl(var(--muted)/.4)] p-3">{s.items.map((item) => <div key={item.productId} className="flex items-center justify-between gap-3 py-1 text-sm" data-testid={`report-sale-${s.id}-item-${item.productId}`}><span className="min-w-0 flex-1 truncate text-[hsl(var(--muted-foreground))]">{item.quantity} × {item.productName}</span><span className="shrink-0 font-mono-app font-semibold">{money(item.subtotal)}</span></div>)}</div></div>)}</div></div>;})}</div>}</section><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_.85fr]"><section className="rounded-2xl border bg-[hsl(var(--card))] p-6"><div className="flex items-center justify-between border-b pb-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Inventario actual</p><h2 className="mt-1 font-display text-2xl font-bold">Lo que tienes hoy</h2></div><Box size={21} className="text-[hsl(var(--primary))]" /></div>{!inventory.data?.products.length ? <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No hay productos en este filtro.</p> : <div className="mt-2 divide-y">{inventory.data?.products.slice(0, 8).map((p) => <div key={p.id} className="flex items-center gap-3 py-3" data-testid={`report-product-${p.id}`}><span className="flex-1 text-sm font-semibold">{p.name}</span><span className="font-mono-app text-xs text-[hsl(var(--muted-foreground))]">{p.stock} pzas.</span><span className="font-mono-app text-sm font-bold">{money(p.salePrice * p.stock)}</span></div>)}</div>}</section><section className="rounded-2xl border bg-[hsl(var(--card))] p-6"><div className="flex items-center justify-between border-b pb-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Ventas</p><h2 className="mt-1 font-display text-2xl font-bold">Lo más importante</h2></div><BarChart3 size={21} className="text-[hsl(var(--primary))]" /></div><div className="mt-5 grid gap-4"><div className="rounded-xl bg-[hsl(var(--accent)/.55)] p-4"><p className="text-xs text-[hsl(var(--muted-foreground))]">Producto más vendido</p><p className="mt-2 text-lg font-bold">{sales.data?.bestSellingProduct || 'Todavía no hay datos'}</p></div><div className="rounded-xl bg-[hsl(var(--secondary)/.65)] p-4"><p className="text-xs text-[hsl(var(--muted-foreground))]">Total vendido</p><p className="mt-2 font-mono-app text-2xl font-bold">{money(sales.data?.totalSold || 0)}</p></div><div className="flex items-center justify-between text-sm"><span className="text-[hsl(var(--muted-foreground))]">Productos por surtir</span><strong>{sales.data?.lowStockProducts?.length || 0}</strong></div></div></section></div></>}{confirmSale && <div className="fixed inset-0 z-[60] grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true" data-testid="modal-confirm-delete-sale"><div className="w-full max-w-sm rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl"><h3 className="font-display text-2xl font-bold">¿Borrar esta venta?</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Se devolverá el inventario de sus productos y la venta desaparecerá de tus reportes.</p><div className="mt-7 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setConfirmSale(null)} data-testid="button-cancel-delete-sale">Cancelar</Button><Button type="button" variant="danger" onClick={() => deleteSale.mutate({ id: confirmSale }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetSalesReportQueryKey() }); qc.invalidateQueries({ queryKey: getListSalesQueryKey() }); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setConfirmSale(null); }, onError: () => setConfirmSale(null) })} disabled={deleteSale.isPending} data-testid="button-confirm-delete-sale">{deleteSale.isPending ? 'Borrando…' : 'Borrar'}</Button></div></div></div>}</Shell>;
}

function CreditPaymentModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const qc = useQueryClient();
  const createPayment = useCreateCreditPayment();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(amount);
    if (!amount.trim() || !Number.isFinite(v) || v < 1) {
      setError('Escribe un monto válido.');
      return;
    }
    setError('');
    createPayment.mutate(
      { id: sale.id, data: { amount: Math.round(v), paymentMethod: paymentMethod.trim() || undefined, note: note.trim() || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
          qc.invalidateQueries({ queryKey: getListCreditPaymentsQueryKey(sale.id) });
          onClose();
        },
        onError: () => setError('No se pudo registrar el abono.'),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Abono a crédito</p>
            <h2 className="mt-1 font-display text-3xl font-bold">Registrar abono</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Venta #{sale.saleNumber} · Total {money(sale.total)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-credit-modal">
            <X size={20} />
          </button>
        </div>
        <div className="mt-6 grid gap-4">
          <Field label="Monto del abono" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus data-testid="input-credit-amount" />
          <div className="grid gap-1.5 text-sm font-semibold">
            <label>Método de pago</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-11 w-full rounded-xl border bg-[hsl(var(--card))] px-3 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-credit-method">
              <option value="">Sin especificar</option>
              {PAYMENT_METHODS.filter((m) => m !== 'Crédito').map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <Field label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referencia del pago" data-testid="input-credit-note" />
        </div>
        {error && <p className="mt-4 text-sm text-[hsl(var(--destructive))]" data-testid="status-credit-error">{error}</p>}
        <div className="mt-7 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} data-testid="button-cancel-credit">Cancelar</Button>
          <Button type="submit" disabled={createPayment.isPending} data-testid="button-save-credit">{createPayment.isPending ? 'Guardando…' : 'Registrar abono'}</Button>
        </div>
      </form>
    </div>
  );
}

function SaleCreditPayments({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const payments = useListCreditPayments(sale.id);
  const paid = (payments.data || []).reduce((sum, p) => sum + p.amount, 0);
  const remaining = sale.total - paid;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.45)] p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border bg-[hsl(var(--card))] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Detalle de crédito</p>
            <h2 className="mt-1 font-display text-3xl font-bold">Venta #{sale.saleNumber}</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{sale.clientName || 'Cliente sin nombre'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-payments-modal">
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-[hsl(var(--muted)/.4)] p-3 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Total</p>
            <p className="mt-1 font-mono-app text-lg font-bold">{money(sale.total)}</p>
          </div>
          <div className="rounded-xl bg-[hsl(var(--accent)/.5)] p-3 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Pagado</p>
            <p className="mt-1 font-mono-app text-lg font-bold text-green-600">{money(paid)}</p>
          </div>
          <div className="rounded-xl bg-[hsl(var(--secondary)/.6)] p-3 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Pendiente</p>
            <p className="mt-1 font-mono-app text-lg font-bold text-orange-600">{money(remaining)}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">Productos de la venta</p>
          <div className="space-y-1.5 rounded-xl bg-[hsl(var(--muted)/.4)] p-3">
            {sale.items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{item.quantity} × {item.productName}</span>
                <span className="shrink-0 font-mono-app text-[hsl(var(--muted-foreground))]">{money(item.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>

        {!!sale.notes && (
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">Nota de la venta</p>
            <p className="rounded-xl bg-[hsl(var(--muted)/.4)] p-3 text-sm" data-testid="text-credit-sale-notes">{sale.notes}</p>
          </div>
        )}

        <div className="mt-6">
          <p className="mb-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">Abonos registrados</p>
          {payments.isLoading ? (
            <div className="space-y-2">{[1, 2].map((n) => <div key={n} className="h-16 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />)}</div>
          ) : !payments.data?.length ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Aún no hay abonos registrados.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto">
              {payments.data.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="font-bold">{money(p.amount)}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{p.paymentMethod || 'Sin método'}{p.note ? ` · ${p.note}` : ''}</p>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{dateLabel(p.date)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" onClick={onClose} data-testid="button-close-payments">Cerrar</Button>
        </div>
      </div>
    </div>
  );
}

function CarteraPage() {
  const sales = useListSales({ period: 'all' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'pending' | 'paid'>('all');
  const [paymentModal, setPaymentModal] = useState<Sale | null>(null);
  const [detailModal, setDetailModal] = useState<Sale | null>(null);

  const creditSales = useMemo(() => {
    const all = (sales.data || []).filter((s) => s.paymentMethod === 'Crédito');
    return all.filter((s) => {
      const matchesSearch = !search || (s.clientName || '').toLowerCase().includes(search.toLowerCase());
      const isPaid = (s.creditPaid ?? 0) >= s.total;
      const matchesStatus = status === 'all' || (status === 'paid' ? isPaid : !isPaid);
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales.data, search, status]);
  const exportRows = () => {
    const rows: (string | number)[][] = [['Cliente', 'Teléfono', 'Venta', 'Fecha', 'Total', 'Abonado', 'Saldo', 'Estado']];
    for (const sale of creditSales) {
      const paid = sale.creditPaid ?? 0;
      rows.push([sale.clientName || 'Cliente sin nombre', sale.clientPhone || '', `#${sale.saleNumber}`, dateLabel(sale.date), sale.total, paid, sale.total - paid, paid >= sale.total ? 'Pagado' : 'Pendiente']);
    }
    rows.push([]);
    rows.push(['TOTAL', '', '', '', creditSales.reduce((sum, s) => sum + s.total, 0), creditSales.reduce((sum, s) => sum + (s.creditPaid ?? 0), 0), creditSales.reduce((sum, s) => sum + (s.total - (s.creditPaid ?? 0)), 0), '']);
    return rows;
  };
  const downloadCsv = () => downloadBlob(new Blob([toCsv(exportRows())], { type: 'text/csv;charset=utf-8' }), `cartera-${new Date().toISOString().slice(0, 10)}.csv`);
  const downloadXlsx = () => buildXlsxBlob(exportRows()).then((blob) => downloadBlob(blob, `cartera-${new Date().toISOString().slice(0, 10)}.xlsx`));

  return (
    <Shell>
      <PageHeading eyebrow="Créditos" title="Cartera" description="Gestiona las ventas a crédito y sus abonos." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Buscar cliente</span>
          <span className="relative">
            <Search size={18} className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre del cliente..." className="h-11 w-full rounded-xl border bg-[hsl(var(--card))] pl-10 pr-4 outline-none focus:border-[hsl(var(--primary))]" data-testid="input-search-credit" />
          </span>
        </label>
        <div className="grid gap-1.5 sm:w-44">
          <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Estado</span>
          <label className="relative">
            <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | 'pending' | 'paid')} className="h-11 w-full appearance-none rounded-xl border bg-[hsl(var(--card))] pl-4 pr-10 text-sm font-semibold outline-none focus:border-[hsl(var(--primary))]" data-testid="select-status-credit">
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="paid">Pagadas</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" />
          </label>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="secondary" className="min-h-[44px] px-3 text-sm" onClick={downloadCsv} data-testid="button-export-cartera-csv"><Download size={15} /> CSV</Button>
          <Button variant="secondary" className="min-h-[44px] px-3 text-sm" onClick={downloadXlsx} data-testid="button-export-cartera-xlsx"><Download size={15} /> XLSX</Button>
        </div>
      </div>

      {sales.isLoading ? (
        <div className="grid gap-3">{[1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />)}</div>
      ) : sales.isError ? (
        <StatusMessage text="No pudimos cargar las ventas." onRetry={() => sales.refetch()} />
      ) : creditSales.length === 0 ? (
        <StatusMessage type="empty" text={search || status !== 'all' ? 'No encontramos créditos con esos filtros.' : 'No hay ventas a crédito registradas.'} />
      ) : (
        <div className="grid gap-3">
          {creditSales.map((sale) => {
            const paid = sale.creditPaid ?? 0;
            const remaining = sale.total - paid;
            const isPaid = remaining <= 0;
            return (
              <div key={sale.id} className="overflow-hidden rounded-2xl border bg-[hsl(var(--card))]" data-testid={`credit-sale-${sale.id}`}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
                      <CreditCard size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold">{sale.clientName || 'Cliente sin nombre'}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Venta #{sale.saleNumber} · {dateLabel(sale.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono-app text-lg font-bold">{money(sale.total)}</p>
                      {sale.clientPhone && <p className="text-xs text-[hsl(var(--muted-foreground))]">{sale.clientPhone}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`} data-testid={`status-credit-${sale.id}`}>
                      {isPaid ? 'Pagado' : `Debe ${money(remaining)}`}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="min-h-[32px] px-2 text-xs" onClick={() => setDetailModal(sale)} data-testid={`button-view-credit-${sale.id}`}>
                        Ver abonos
                      </Button>
                      {!isPaid && (
                        <Button className="min-h-[32px] px-2 text-xs" onClick={() => setPaymentModal(sale)} data-testid={`button-add-credit-${sale.id}`}>
                          Abonar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {!!sale.items?.length && (
                  <div className="flex flex-wrap gap-2 border-t px-5 py-3" data-testid={`credit-sale-items-${sale.id}`}>
                    {sale.items.map((item) => (
                      <span key={item.productId} className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--muted)/.5)] px-2.5 py-1 text-sm">
                        <span className="font-semibold">{item.quantity} × {item.productName}</span>
                        <span className="font-mono-app text-xs text-[hsl(var(--muted-foreground))]">{money(item.subtotal)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {!!sale.notes && (
                  <p className="border-t px-5 py-2 text-xs text-[hsl(var(--muted-foreground))]" data-testid={`credit-sale-notes-${sale.id}`}>
                    <span className="font-semibold">Nota:</span> {sale.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {paymentModal && <CreditPaymentModal sale={paymentModal} onClose={() => setPaymentModal(null)} />}
      {detailModal && <SaleCreditPayments sale={detailModal} onClose={() => setDetailModal(null)} />}
    </Shell>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <div className="grid min-h-[50vh] place-items-center text-sm text-[hsl(var(--muted-foreground))]">Cargando…</div>;
  return isSignedIn ? <>{children}</> : <Redirect to="/sign-in" />;
}

function AuthCard({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { isSignedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pending, setPending] = useState(false);
  const isSignIn = mode === 'sign-in';

  if (isSignedIn) return <Redirect to="/app" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setPending(true);
    try {
      if (isSignIn) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo('Revisa tu correo para confirmar la cuenta, o vuelve a intentar iniciar sesión si ya estaba creada.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Algo salió mal, intenta de nuevo.';
      setError(message.replace(/^Error:\s*/, ''));
    } finally {
      setPending(false);
    }
  };

  return <div className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8">
    <div className="w-full max-w-[440px] rounded-2xl border border-[#ded8ca] bg-[#fffdf8] p-8 shadow-sm">
      <div className="mb-7 flex justify-center"><Brand /></div>
      <h1 className="text-center font-[Fraunces] text-3xl font-bold text-[#274347]">{isSignIn ? 'Qué gusto verte' : 'Crea tu cuenta'}</h1>
      <p className="mt-1 text-center text-sm text-[#687678]">{isSignIn ? 'Entra para continuar con tu negocio' : 'Empieza a llevar tu negocio con calma'}</p>
      <form onSubmit={submit} className="mt-7 grid gap-4">
        <Field label="Correo" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" data-testid="input-auth-email" />
        <Field label="Contraseña" type="password" required autoComplete={isSignIn ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" data-testid="input-auth-password" />
        {error && <p className="rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" data-testid="status-auth-error">{error}</p>}
        {info && <p className="rounded-xl bg-[hsl(var(--accent)/.6)] p-3 text-sm text-[hsl(var(--accent-foreground))]">{info}</p>}
        <Button type="submit" disabled={pending} className="w-full" data-testid="button-auth-submit">{pending ? 'Un momento…' : isSignIn ? 'Entrar' : 'Crear cuenta'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-[#687678]">
        {isSignIn ? <>¿Aún no tienes cuenta? <Link href="/sign-up" className="font-bold text-[#b85e3c]">Créala aquí</Link></> : <>¿Ya tienes cuenta? <Link href="/sign-in" className="font-bold text-[#b85e3c]">Inicia sesión</Link></>}
      </p>
    </div>
  </div>;
}

function SignInPage() { return <AuthCard mode="sign-in" />; }
function SignUpPage() { return <AuthCard mode="sign-up" />; }

function Routes() {
  return <Switch><Route path="/" component={Landing} /><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/app"><Protected><Dashboard /></Protected></Route><Route path="/app/productos"><Protected><Products /></Protected></Route><Route path="/app/venta"><Protected><SalePage /></Protected></Route><Route path="/app/compras"><Protected><Purchases /></Protected></Route><Route path="/app/cartera"><Protected><CarteraPage /></Protected></Route><Route path="/app/reportes"><Protected><Reports /></Protected></Route><Route component={NotFound} /></Switch>;
}

function App() {
  return <AuthProvider><QueryClientProvider client={queryClient}><TooltipProvider><CompanyProvider><WouterRouter base={basePath}><Routes /></WouterRouter><Toaster /></CompanyProvider></TooltipProvider></QueryClientProvider></AuthProvider>;
}

export default App;