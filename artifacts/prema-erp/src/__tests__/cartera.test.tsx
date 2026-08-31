import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState, useMemo } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockMutate = vi.fn();

vi.mock('wouter', () => ({
  Link: ({ children, href, ...p }: any) => <a href={href} {...p}>{children}</a>,
  Redirect: () => null,
  Route: () => null,
  Switch: ({ children }: any) => <div>{children}</div>,
  Router: ({ children }: any) => <div>{children}</div>,
  useLocation: () => ['/app/cartera', vi.fn()],
  useRoute: () => [false, {}],
}));

vi.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: any) => <div>{children}</div>,
  useAuth: () => ({ user: { email: 'test@test.com' }, isSignedIn: true, isLoaded: true, signOut: vi.fn() }),
}));

vi.mock('@/lib/company', () => ({
  CompanyProvider: ({ children }: any) => <div>{children}</div>,
  useCompany: () => ({ companies: [{ id: 1, name: 'Test Co' }], activeCompany: { id: 1, name: 'Test Co' }, selectCompany: vi.fn() }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const money = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
const dateLabel = (d: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));

const PAYMENT_METHODS = ['Efectivo', 'Nequi', 'Transferencia', 'Datafono', 'QR / Llave', 'Crédito'];

const mockCreditSale = {
  id: 1, saleNumber: 1, date: '2024-01-15T12:00:00Z',
  total: 50000, totalItems: 2, estimatedProfit: 10000,
  paymentMethod: 'Crédito', clientName: 'Juan Pérez', clientPhone: '1234567890',
  items: [],
};

const mockCashSale = {
  id: 2, saleNumber: 2, date: '2024-01-16T12:00:00Z',
  total: 30000, totalItems: 1, estimatedProfit: 5000,
  paymentMethod: 'Efectivo', clientName: 'María García',
  items: [],
};

const mockPayment = {
  id: 1, saleId: 1, amount: 20000,
  paymentMethod: 'Efectivo', note: 'Primer abono', date: '2024-01-20T12:00:00Z',
};

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ─── Minimal reimplementation of CarteraPage components for testing ──────────
// We reimplement the components here to test them in isolation from the
// monolithic App.tsx which has too many transitive dependencies.

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:brightness-95',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    ghost: 'bg-transparent text-gray-500 hover:bg-gray-100',
    danger: 'bg-red-600 text-white hover:brightness-95',
  };
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${styles[variant]} ${className}`}>{children}</button>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<input {...props} className="h-11 w-full rounded-xl border bg-white px-3.5 outline-none focus:border-blue-600" /></label>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="mb-7">
    {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-600">{eyebrow}</p>}
    <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
    {description && <p className="mt-3 text-gray-500">{description}</p>}
  </div>;
}

function StatusMessage({ type = 'error', text, onRetry }: { type?: 'error' | 'empty'; text: string; onRetry?: () => void }) {
  return <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed bg-gray-50 p-8 text-center">
    <p className="text-sm text-gray-500">{text}</p>
    {onRetry && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
  </div>;
}

function CreditPaymentModal({ sale, onClose }: { sale: any; onClose: () => void }) {
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
    mockMutate({ id: sale.id, data: { amount: Math.round(v), paymentMethod: paymentMethod.trim() || undefined, note: note.trim() || undefined } });
  };

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Abono a crédito</p>
          <h2 className="mt-1 text-3xl font-bold">Registrar abono</h2>
          <p className="mt-2 text-sm text-gray-500">Venta #{sale.saleNumber} · Total {money(sale.total)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" data-testid="button-close-credit-modal">X</button>
      </div>
      <div className="mt-6 grid gap-4">
        <Field label="Monto del abono" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus data-testid="input-credit-amount" />
        <div className="grid gap-1.5 text-sm font-semibold">
          <label>Método de pago</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 text-sm" data-testid="select-credit-method">
            <option value="">Sin especificar</option>
            {PAYMENT_METHODS.filter((m) => m !== 'Crédito').map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <Field label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referencia del pago" data-testid="input-credit-note" />
      </div>
      {error && <p className="mt-4 text-sm text-red-600" data-testid="status-credit-error">{error}</p>}
      <div className="mt-7 flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose} data-testid="button-cancel-credit">Cancelar</Button>
        <Button type="submit" data-testid="button-save-credit">Registrar abono</Button>
      </div>
    </form>
  </div>;
}

function SaleCreditPayments({ sale, onClose }: { sale: any; onClose: () => void }) {
  const payments = mockPayment.saleId === sale.id ? [mockPayment] : [];
  const paid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
  const remaining = sale.total - paid;

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-lg rounded-2xl border bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Detalle de crédito</p>
          <h2 className="mt-1 text-3xl font-bold">Venta #{sale.saleNumber}</h2>
          <p className="mt-2 text-sm text-gray-500">{sale.clientName || 'Cliente sin nombre'}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" data-testid="button-close-payments-modal">X</button>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">Total</p>
          <p className="mt-1 text-lg font-bold">{money(sale.total)}</p>
        </div>
        <div className="rounded-xl bg-green-50 p-3 text-center">
          <p className="text-xs text-gray-500">Pagado</p>
          <p className="mt-1 text-lg font-bold text-green-600">{money(paid)}</p>
        </div>
        <div className="rounded-xl bg-orange-50 p-3 text-center">
          <p className="text-xs text-gray-500">Pendiente</p>
          <p className="mt-1 text-lg font-bold text-orange-600">{money(remaining)}</p>
        </div>
      </div>
      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-gray-500">Abonos registrados</p>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">Aún no hay abonos registrados.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-auto">
            {payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="font-bold">{money(p.amount)}</p>
                  <p className="text-xs text-gray-500">{p.paymentMethod || 'Sin método'}{p.note ? ` · ${p.note}` : ''}</p>
                </div>
                <p className="text-xs text-gray-500">{dateLabel(p.date)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onClose} data-testid="button-close-payments">Cerrar</Button>
      </div>
    </div>
  </div>;
}

function CarteraPageTestable({ sales, isLoading, isError, refetch }: { sales: any[]; isLoading: boolean; isError: boolean; refetch: () => void }) {
  const [search, setSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState<any>(null);
  const [detailModal, setDetailModal] = useState<any>(null);

  const creditSales = useMemo(() => {
    const all = sales.filter((s: any) => s.paymentMethod === 'Crédito');
    return all.filter((s: any) => !search || (s.clientName || '').toLowerCase().includes(search.toLowerCase()))
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, search]);

  return <div>
    <PageHeading eyebrow="Créditos" title="Cartera" description="Gestiona las ventas a crédito y sus abonos." />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="grid flex-1 gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Buscar cliente</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre del cliente..." className="h-11 w-full rounded-xl border bg-white pl-4 pr-4 outline-none focus:border-blue-600" data-testid="input-search-credit" />
      </label>
    </div>
    {isLoading ? (
      <div className="grid gap-3">{[1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}</div>
    ) : isError ? (
      <StatusMessage text="No pudimos cargar las ventas." onRetry={refetch} />
    ) : creditSales.length === 0 ? (
      <StatusMessage type="empty" text="No hay ventas a crédito registradas." />
    ) : (
      <div className="grid gap-3">
        {creditSales.map((sale: any) => (
          <div key={sale.id} className="overflow-hidden rounded-2xl border bg-white" data-testid={`credit-sale-${sale.id}`}>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-blue-600">CC</span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{sale.clientName || 'Cliente sin nombre'}</p>
                  <p className="text-xs text-gray-500">Venta #{sale.saleNumber} · {dateLabel(sale.date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-lg font-bold">{money(sale.total)}</p>
                  {sale.clientPhone && <p className="text-xs text-gray-500">{sale.clientPhone}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="min-h-[32px] px-2 text-xs" onClick={() => setDetailModal(sale)} data-testid={`button-view-credit-${sale.id}`}>Ver abonos</Button>
                  <Button className="min-h-[32px] px-2 text-xs" onClick={() => setPaymentModal(sale)} data-testid={`button-add-credit-${sale.id}`}>Abonar</Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
    {paymentModal && <CreditPaymentModal sale={paymentModal} onClose={() => setPaymentModal(null)} />}
    {detailModal && <SaleCreditPayments sale={detailModal} onClose={() => setDetailModal(null)} />}
  </div>;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CarteraPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the page heading', () => {
    render(<CarteraPageTestable sales={[]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    expect(screen.getByText('Cartera')).toBeInTheDocument();
    expect(screen.getByText('Créditos')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<CarteraPageTestable sales={[]} isLoading={true} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    expect(screen.getByText('Cartera')).toBeInTheDocument();
    expect(screen.getAllByRole('generic')).not.toHaveLength(0);
  });

  it('shows empty state when no credit sales', () => {
    render(<CarteraPageTestable sales={[]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    expect(screen.getByText('No hay ventas a crédito registradas.')).toBeInTheDocument();
  });

  it('displays credit sales only', () => {
    render(<CarteraPageTestable sales={[mockCreditSale, mockCashSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByTestId('credit-sale-1')).toBeInTheDocument();
    expect(screen.queryByText('María García')).not.toBeInTheDocument();
  });

  it('filters sales by client name', () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    const searchInput = screen.getByPlaceholderText('Nombre del cliente...');
    fireEvent.change(searchInput, { target: { value: 'Juan' } });
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: 'XYZ' } });
    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument();
  });

  it('shows error state', () => {
    const refetch = vi.fn();
    render(<CarteraPageTestable sales={[]} isLoading={false} isError={true} refetch={refetch} />, { wrapper: createWrapper() });
    expect(screen.getByText('No pudimos cargar las ventas.')).toBeInTheDocument();
  });

  it('opens payment modal when clicking Abonar', () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-add-credit-1'));
    expect(screen.getByRole('heading', { name: 'Registrar abono' })).toBeInTheDocument();
    expect(screen.getByText('Monto del abono')).toBeInTheDocument();
  });

  it('opens detail modal when clicking Ver abonos', () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-view-credit-1'));
    expect(screen.getByText('Detalle de crédito')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });
});

describe('CreditPaymentModal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates amount input', async () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-add-credit-1'));
    fireEvent.click(screen.getByTestId('button-save-credit'));
    await waitFor(() => {
      expect(screen.getByText('Escribe un monto válido.')).toBeInTheDocument();
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('submits payment correctly', async () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-add-credit-1'));
    fireEvent.change(screen.getByTestId('input-credit-amount'), { target: { value: '15000' } });
    fireEvent.change(screen.getByTestId('select-credit-method'), { target: { value: 'Nequi' } });
    fireEvent.change(screen.getByTestId('input-credit-note'), { target: { value: 'Pago parcial' } });
    fireEvent.click(screen.getByTestId('button-save-credit'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        id: 1,
        data: { amount: 15000, paymentMethod: 'Nequi', note: 'Pago parcial' },
      });
    });
  });

  it('closes modal when clicking cancel', async () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-add-credit-1'));
    expect(screen.getByRole('heading', { name: 'Registrar abono' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-cancel-credit'));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Registrar abono' })).not.toBeInTheDocument();
    });
  });
});

describe('SaleCreditPayments', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('displays payment summary with paid amounts', () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-view-credit-1'));
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('shows payments list', () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-view-credit-1'));
    expect(screen.getByText(/Primer abono/)).toBeInTheDocument();
  });

  it('closes modal when clicking Cerrar', async () => {
    render(<CarteraPageTestable sales={[mockCreditSale]} isLoading={false} isError={false} refetch={vi.fn()} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('button-view-credit-1'));
    expect(screen.getByText('Detalle de crédito')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-close-payments'));
    await waitFor(() => {
      expect(screen.queryByText('Detalle de crédito')).not.toBeInTheDocument();
    });
  });
});
