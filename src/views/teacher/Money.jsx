import { Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useApp, useAction, Tabs, Icon, Field, Empty, Sheet, WaButton, Seg } from '../../ui.jsx';
import { isOpen, PAY_METHODS, PLAN_TYPES } from '../../core/billing.js';
import { incomeWeeks, monthView, yearSummary, incomeByStudent, EXPENSE_CATEGORIES } from '../../core/finance.js';
import { msgPaymentLate, msgPackageFull, msgPaymentReceived } from '../../core/messages.js';
import { fmtTL, parseTL } from '../../core/money.js';
import { fmtDate, fmtShort, fmtMonth, monthKey, monthFirst, addMonths, addDays, monthLast } from '../../core/dates.js';
import { PeriodBody, periodRange } from '../shared.jsx';

export function Money() {
  const [tab, setTab] = useState('pay');
  return (
    <>
      <Tabs tabs={[['pay', 'Ödemeler'], ['cal', 'Gelir Takvimi'], ['acc', 'Muhasebe']]} value={tab} onChange={setTab} />
      {tab === 'pay' && <Payments />}
      {tab === 'cal' && <IncomeCalendar />}
      {tab === 'acc' && <Accounting />}
    </>
  );
}

/* ───────────── Ödemeler */
function Payments() {
  const { data, periods, now, store, reload } = useApp();
  const [run] = useAction();
  const [view, setView] = useState('open');
  const [paying, setPaying] = useState(null);
  const byId = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);

  const soon = addDays(now.date, 14);
  const groups = {
    open: periods.filter(isOpen).sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === 'late' ? -1 : 1)),
    upcoming: periods.filter((p) => (p.status === 'running' || p.status === 'future') && p.remaining > 0 && p.due <= soon).sort((a, b) => a.due.localeCompare(b.due)),
    paid: periods.filter((p) => p.status === 'paid').sort((a, b) => b.due.localeCompare(a.due)).slice(0, 60),
  };
  const history = data.payments.filter((p) => !p.deleted_at).sort((a, b) => b.paid_date.localeCompare(a.paid_date) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 80);
  const sum = (xs) => xs.reduce((a, p) => a + p.remaining, 0);

  const delPay = (p) => confirm(`${fmtTL(p.amount)} ödeme kaydı silinsin mi?`) && run(async () => { await store.update('payments', p.id, { deleted_at: new Date().toISOString() }); await reload(); }, 'Ödeme silindi');

  return (
    <div class="stack">
      <div class="card figures">
        <div class="figure"><div class="v">{fmtTL(sum(groups.open.filter((p) => p.status === 'late')))}</div><div class="l">Geciken</div></div>
        <div class="figure"><div class="v">{fmtTL(sum(groups.open.filter((p) => p.status === 'due')))}</div><div class="l">Ödeme zamanı gelen</div></div>
        <div class="figure"><div class="v">{fmtTL(sum(groups.upcoming))}</div><div class="l">14 gün içinde</div></div>
      </div>
      <Seg options={[['open', 'Bekleyen'], ['upcoming', 'Yaklaşan'], ['paid', 'Ödenen'], ['history', 'Kayıtlar']]} value={view} onChange={setView} />
      {view !== 'history' ? (
        <div class="card">
          {groups[view].length === 0 ? <Empty title={view === 'open' ? 'Bekleyen ödeme yok' : view === 'upcoming' ? 'Yaklaşan ödeme yok' : 'Henüz ödenen dönem yok'} /> : (
            <ul class="list">
              {groups[view].map((p) => {
                const s = byId.get(p.student_id);
                return (
                  <li key={p.key} class="stack">
                    <PeriodBody p={p} />
                    {view !== 'paid' && (
                      <div class="row wrap">
                        <button class="btn small primary" onClick={() => setPaying(p)}>Ödeme al</button>
                        {p.status === 'late' && <WaButton small phone={s.parent_phone} text={msgPaymentLate(p)} label="Hatırlat" />}
                        {p.status === 'due' && <WaButton small phone={s.parent_phone} text={msgPackageFull(p)} label="Paket doldu mesajı" />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div class="card">
          {history.length === 0 ? <Empty title="Ödeme kaydı yok" /> : (
            <div class="table-wrap"><table class="t">
              <thead><tr><th>Tarih</th><th>Öğrenci</th><th>Yöntem</th><th class="n">Tutar</th><th /></tr></thead>
              <tbody>{history.map((p) => (
                <tr key={p.id}>
                  <td style="white-space:nowrap">{fmtShort(p.paid_date)}</td>
                  <td>{byId.get(p.student_id)?.name || '—'}{p.note ? <div class="small muted">{p.note}</div> : null}</td>
                  <td class="small">{PAY_METHODS[p.method] || p.method}</td>
                  <td class="n num">{fmtTL(p.amount)}</td>
                  <td><button class="btn small ghost danger" aria-label="Sil" onClick={() => delPay(p)}><Icon name="trash" /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
      {paying && <PaymentSheet period={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

export function PaymentSheet({ period, onClose }) {
  const { data, store, reload, now } = useApp();
  const [run, busy] = useAction();
  const [amount, setAmount] = useState(String((period.remaining || period.amount) / 100).replace('.', ','));
  const [date, setDate] = useState(now.date);
  const [method, setMethod] = useState('nakit');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const s = data.students.find((x) => x.id === period.student_id);

  const save = async () => {
    const k = parseTL(amount);
    if (!(k > 0)) return setErr('Geçerli bir tutar yazın.');
    if (!date) return setErr('Tarih seçin.');
    if (k > period.remaining && period.remaining > 0 && !confirm(`Yazılan tutar kalan borçtan (${fmtTL(period.remaining)}) fazla. Yine de kaydedilsin mi?`)) return;
    setErr('');
    await run(async () => {
      await store.insert('payments', { student_id: period.student_id, period_key: period.key, amount: k, paid_date: date, method, note: note.trim(), deleted_at: null, created_at: new Date().toISOString() });
      await reload();
      setDone(k);
    }, 'Ödeme kaydedildi');
  };

  return (
    <Sheet title={done ? 'Ödeme alındı' : 'Ödeme al'} onClose={onClose}>
      {done ? (
        <div class="stack">
          <div class="msg">{msgPaymentReceived(done)}</div>
          <div class="row wrap">
            {method !== 'indirim' && <WaButton phone={s.parent_phone} text={msgPaymentReceived(done)} label="Veliye teşekkür mesajı" />}
            <button class="btn" onClick={onClose}>Tamam</button>
          </div>
        </div>
      ) : (
        <div class="stack">
          <div class="card card-pad"><PeriodBody p={period} /></div>
          <div class="grid2">
            <Field label="Tutar (TL)" required><input class="input" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} /></Field>
            <Field label="Ödeme tarihi" required><input class="input" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} /></Field>
          </div>
          <Field label="Yöntem">
            <select class="input" value={method} onChange={(e) => setMethod(e.currentTarget.value)}>
              {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Not (isteğe bağlı)"><input class="input" value={note} onInput={(e) => setNote(e.currentTarget.value)} /></Field>
          {err && <div class="error">{err}</div>}
          <button class="btn primary block" disabled={busy} onClick={save}>Ödemeyi kaydet</button>
        </div>
      )}
    </Sheet>
  );
}

/* ───────────── Gelir takvimi */
function IncomeCalendar() {
  const { data, periods, now } = useApp();
  const [openWeek, setOpenWeek] = useState(null);
  const { rows, overdue_total } = useMemo(() => incomeWeeks(periods, data.payments, now.date), [periods, data.payments, now.date]);
  const cur = rows.find((r) => r.is_current);
  const next4 = rows.filter((r) => !r.is_past && !r.is_current).slice(0, 4).reduce((a, r) => a + r.remaining, 0);

  return (
    <div class="stack">
      <div class="card figures">
        <div class="figure"><div class="v">{fmtTL(cur.target)}</div><div class="l">Bu hafta hedef</div></div>
        <div class="figure"><div class="v">{fmtTL(cur.cash)}</div><div class="l">Bu hafta kasaya giren</div></div>
        <div class="figure"><div class="v">{fmtTL(next4)}</div><div class="l">Sonraki 4 hafta beklenen</div></div>
        <div class="figure"><div class="v">{fmtTL(overdue_total)}</div><div class="l">Geciken alacak</div></div>
      </div>
      <div class="hint" style="padding:0 4px">Her dönem, vadesinin düştüğü haftada görünür. Bu haftanın hedefine gecikmiş alacaklar da eklenir. Satıra dokunursanız ayrıntı açılır.</div>
      <div class="card"><div class="table-wrap">
        <table class="t">
          <thead><tr><th>Hafta</th><th class="n">Beklenen</th><th class="n">Tahsil</th><th class="n">Kalan</th><th class="n">Kasaya giren</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.week_start}>
                <tr class={r.is_current ? 'current' : ''} style="cursor:pointer" onClick={() => setOpenWeek(openWeek === r.week_start ? null : r.week_start)}>
                  <td style="white-space:nowrap">{fmtShort(r.week_start)} – {fmtShort(r.week_end)}{r.is_current ? <div class="small muted">bu hafta</div> : null}</td>
                  <td class="n num">{r.expected ? fmtTL(r.expected) : '—'}</td>
                  <td class="n num">{r.collected ? fmtTL(r.collected) : '—'}</td>
                  <td class="n num" style={r.is_past && r.remaining > 0 ? 'color:var(--madder)' : ''}>{r.remaining ? fmtTL(r.remaining) : '—'}</td>
                  <td class="n num">{r.cash ? fmtTL(r.cash) : '—'}</td>
                </tr>
                {openWeek === r.week_start && (
                  <tr><td colSpan={5} style="background:var(--sunk)">
                    {r.items.length === 0 ? <span class="muted">Bu haftaya vadesi düşen dönem yok.</span> : r.items.map((p) => (
                      <div key={p.key} class="spread small" style="padding:4px 0">
                        <span>{p.student_name} · {PLAN_TYPES[p.type]} · vade {fmtShort(p.due)}</span>
                        <span class="num">{fmtTL(p.amount)}{p.remaining ? ` (kalan ${fmtTL(p.remaining)})` : ' ✓'}</span>
                      </div>
                    ))}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  );
}

/* ───────────── Muhasebe */
function Accounting() {
  const { data, periods, now, settings, store, reload } = useApp();
  const [run] = useAction();
  const [month, setMonth] = useState(monthKey(now.date));
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const mv = useMemo(() => monthView({ periods, payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments, settings }, month, now.date), [periods, data, month, now.date, settings]);
  const year = useMemo(() => yearSummary({ payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments }, now.date), [data, now.date]);
  const byStudent = incomeByStudent(data.students, data.payments, monthFirst(month), monthLast(month));
  const max = Math.max(1, ...year.map((y) => Math.max(y.income, y.expense)));
  const shift = (n) => setMonth(monthKey(addMonths(monthFirst(month), n)));
  const S = mv.summary;

  const unpay = (i) => confirm(`${i.name} için ödeme işareti kaldırılsın mı?`) && run(async () => { await store.remove('expense_payments', i.payment_id); await reload(); });
  const delExp = (i) => confirm(`"${i.name}" gideri tamamen silinsin mi? (Geçmiş ödeme kayıtları da silinir.)`) && run(async () => { await store.remove('expenses', i.expense_id); await reload(); }, 'Gider silindi');
  const endExp = (i) => confirm(`"${i.name}" bu aydan sonra bitsin mi?`) && run(async () => { await store.update('expenses', i.expense_id, { end_month: month }); await reload(); }, 'Gider sonlandırıldı');
  const setCash = () => {
    const v = prompt('Şu an elinizdeki nakit (TL):', String((settings.cash_on_hand || 0) / 100));
    if (v === null) return;
    const k = parseTL(v || '0');
    if (Number.isNaN(k)) return alert('Geçerli bir tutar yazın.');
    run(async () => { await store.upsertSettings({ cash_on_hand: k }); await reload(); }, 'Kaydedildi');
  };

  return (
    <div class="stack">
      <div class="card card-pad spread">
        <button class="btn small" aria-label="Önceki ay" onClick={() => shift(-1)}><Icon name="back" /></button>
        <div class="num" style="font-size:20px">{fmtMonth(month)}</div>
        <button class="btn small" aria-label="Sonraki ay" onClick={() => shift(1)}><Icon name="chevron" /></button>
      </div>
      <div class="card figures">
        <div class="figure"><div class="v">{fmtTL(S.expenses_total)}</div><div class="l">Giderler</div></div>
        <div class="figure"><div class="v">{fmtTL(S.received)}</div><div class="l">Alınan tahsilat</div></div>
        <div class="figure"><div class="v">{fmtTL(S.expected)}</div><div class="l">{mv.is_past ? 'Beklenen (geçti)' : 'Ay sonuna beklenen'}</div></div>
        <div class="figure"><div class="v" style={`color:${S.gap >= 0 ? 'var(--sage)' : 'var(--madder)'}`}>{fmtTL(S.gap, { sign: true })}</div><div class="l">Fark</div></div>
      </div>
      <div class="advice">{mv.advice.map((a, i) => <div key={i} class={a.level}>{a.text}</div>)}</div>

      <div class="section-head"><h2 class="section-title">Giderler</h2><button class="btn small" onClick={() => setAdding(true)}><Icon name="plus" /> Gider ekle</button></div>
      <div class="card">
        {mv.expenses.length === 0 ? <Empty title="Bu ay gider yok" /> : (
          <ul class="list">
            {mv.expenses.map((i) => (
              <li key={i.expense_id} class="spread">
                <div class="grow">
                  <div class="item-title">{i.name}</div>
                  <div class="item-sub">{i.category} · {i.one_time ? 'tek seferlik' : 'her ay'} · son gün {fmtShort(i.due_date)}{i.paid ? ` · ödendi ${fmtShort(i.paid_date)}` : ''}</div>
                </div>
                <div class="right">
                  <div class="num">{fmtTL(i.paid ? i.paid_amount : i.amount)}</div>
                  <div class="row" style="justify-content:flex-end;gap:4px;margin-top:4px">
                    {i.paid ? <button class="btn small ghost" onClick={() => unpay(i)}><span class="chip ok">Ödendi</span></button>
                      : <button class="btn small" onClick={() => setPaying(i)}>Ödendi</button>}
                    {!i.one_time && <button class="btn small ghost" title="Bu aydan sonra bitir" onClick={() => endExp(i)}>Bitir</button>}
                    <button class="btn small ghost danger" aria-label="Sil" onClick={() => delExp(i)}><Icon name="trash" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!mv.is_past && (
        <>
          <div class="section-head"><h2 class="section-title">Nakit akışı</h2><button class="btn small ghost" onClick={setCash}>Eldeki nakit: {fmtTL(S.cash)}</button></div>
          <div class="card">
            {mv.timeline.length === 0 ? <Empty title="Ay sonuna kadar hareket yok" /> : (
              <div class="table-wrap"><table class="t">
                <thead><tr><th>Tarih</th><th>Hareket</th><th class="n">Tutar</th><th class="n">Bakiye</th></tr></thead>
                <tbody>{mv.timeline.map((r, i) => (
                  <tr key={i}>
                    <td style="white-space:nowrap">{fmtShort(r.date)}</td>
                    <td>{r.kind === 'in' ? `${r.name} ödemesi` : r.name}{r.late ? <span class="chip bad" style="margin-left:6px">gecikmiş</span> : null}</td>
                    <td class="n num" style={`color:${r.kind === 'in' ? 'var(--sage)' : 'var(--text)'}`}>{r.kind === 'in' ? '+' : '−'}{fmtTL(r.amount)}</td>
                    <td class="n num" style={r.balance < 0 ? 'color:var(--madder)' : ''}>{fmtTL(r.balance)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}

      <div class="section-head"><h2 class="section-title">Son 12 ay</h2>
        <div class="legend"><span><i style="background:var(--ink-2)" />Gelir</span><span><i style="background:var(--brass)" />Gider</span></div>
      </div>
      <div class="card card-pad">
        <div class="bars" role="img" aria-label="Son 12 ay gelir ve gider">
          {year.map((y) => (
            <div key={y.month} class="bar" title={`${fmtMonth(y.month)}: gelir ${fmtTL(y.income)}, gider ${fmtTL(y.expense)}`}>
              <i style={`height:${(y.income / max) * 100}%;width:62%`} />
              <i class="exp" style={`height:${(y.expense / max) * 100}%`} />
            </div>
          ))}
        </div>
        <div class="bar-labels">{year.map((y) => <span key={y.month}>{fmtMonth(y.month).slice(0, 3)}</span>)}</div>
        <div class="table-wrap" style="margin-top:12px"><table class="t">
          <thead><tr><th>Ay</th><th class="n">Gelir</th><th class="n">Gider</th><th class="n">Net</th></tr></thead>
          <tbody>{[...year].reverse().filter((y) => y.income || y.expense).map((y) => (
            <tr key={y.month}><td>{fmtMonth(y.month)}</td><td class="n num">{fmtTL(y.income)}</td><td class="n num">{fmtTL(y.expense)}</td><td class="n num" style={`color:${y.net >= 0 ? 'var(--sage)' : 'var(--madder)'}`}>{fmtTL(y.net, { sign: true })}</td></tr>
          ))}
          <tr><td><b>Toplam</b></td><td class="n num"><b>{fmtTL(year.reduce((a, y) => a + y.income, 0))}</b></td><td class="n num"><b>{fmtTL(year.reduce((a, y) => a + y.expense, 0))}</b></td><td class="n num"><b>{fmtTL(year.reduce((a, y) => a + y.net, 0), { sign: true })}</b></td></tr>
          </tbody>
        </table></div>
      </div>

      <div class="section-head"><h2 class="section-title">Öğrenci bazında tahsilat</h2><span class="muted small">{fmtMonth(month)}</span></div>
      <div class="card">
        {byStudent.length === 0 ? <Empty title="Bu ay tahsilat yok" /> : (
          <ul class="list">{byStudent.map((r) => <li key={r.student_id} class="spread"><span>{r.name}</span><span class="num">{fmtTL(r.total)}</span></li>)}</ul>
        )}
      </div>
      {adding && <ExpenseSheet month={month} onClose={() => setAdding(false)} />}
      {paying && <ExpensePaySheet inst={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function ExpenseSheet({ month, onClose }) {
  const { store, reload } = useApp();
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: '', category: 'Kira', amount: '', due_day: '1', repeat: 'monthly', start_month: month, end_month: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => { const v = e.currentTarget.value; setF((o) => ({ ...o, [k]: v })); };
  const save = async () => {
    const amount = parseTL(f.amount), day = Number(f.due_day);
    if (!f.name.trim()) return setErr('Gider adını yazın.');
    if (!(amount > 0)) return setErr('Geçerli bir tutar yazın.');
    if (!(day >= 1 && day <= 31)) return setErr('Ödeme günü 1–31 arası olmalı.');
    if (f.repeat === 'monthly' && f.end_month && f.end_month < f.start_month) return setErr('Bitiş ayı başlangıçtan önce olamaz.');
    const ok = await run(async () => {
      await store.insert('expenses', { name: f.name.trim(), category: f.category, amount, due_day: day, start_month: f.start_month, end_month: f.repeat === 'once' ? f.start_month : f.end_month || null, active: true, note: '', deleted_at: null });
      await reload();
    }, 'Gider eklendi');
    if (ok) onClose();
  };
  return (
    <Sheet title="Gider ekle" onClose={onClose}>
      <div class="stack">
        <Field label="Gider adı" required><input class="input" value={f.name} onInput={set('name')} placeholder="Ör. Kira" /></Field>
        <div class="grid2">
          <Field label="Kategori"><select class="input" value={f.category} onChange={set('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Tutar (TL)" required><input class="input" inputMode="decimal" value={f.amount} onInput={set('amount')} /></Field>
        </div>
        <Seg options={[['monthly', 'Her ay'], ['once', 'Tek seferlik']]} value={f.repeat} onChange={(repeat) => setF((o) => ({ ...o, repeat }))} />
        <div class="grid3">
          <Field label="Ödeme günü"><input class="input" inputMode="numeric" value={f.due_day} onInput={set('due_day')} /></Field>
          <Field label={f.repeat === 'once' ? 'Ay' : 'Başlangıç ayı'}><input class="input" type="month" value={f.start_month} onInput={set('start_month')} /></Field>
          {f.repeat === 'monthly' && <Field label="Bitiş ayı" hint="Boş: süresiz"><input class="input" type="month" value={f.end_month} onInput={set('end_month')} /></Field>}
        </div>
        {err && <div class="error">{err}</div>}
        <button class="btn primary block" disabled={busy} onClick={save}>Kaydet</button>
      </div>
    </Sheet>
  );
}

function ExpensePaySheet({ inst, onClose }) {
  const { store, reload, now } = useApp();
  const [run, busy] = useAction();
  const [amount, setAmount] = useState(String(inst.amount / 100).replace('.', ','));
  const [date, setDate] = useState(now.date < inst.due_date ? now.date : now.date);
  const save = async () => {
    const k = parseTL(amount);
    if (!(k > 0)) return;
    const ok = await run(async () => { await store.insert('expense_payments', { expense_id: inst.expense_id, month: inst.month, paid_date: date, amount: k, deleted_at: null }); await reload(); }, 'Gider ödendi olarak işaretlendi');
    if (ok) onClose();
  };
  return (
    <Sheet title={`${inst.name} · ${fmtMonth(inst.month)}`} onClose={onClose}>
      <div class="stack">
        <div class="grid2">
          <Field label="Ödenen tutar (TL)"><input class="input" inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} /></Field>
          <Field label="Ödeme tarihi"><input class="input" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} /></Field>
        </div>
        <button class="btn primary block" disabled={busy} onClick={save}>Ödendi olarak kaydet</button>
      </div>
    </Sheet>
  );
}

export { periodRange, fmtDate };
