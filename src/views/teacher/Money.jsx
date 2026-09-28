import { Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useApp, useAction, Tabs, Icon, Field, Empty, Sheet, WaButton, Seg, StatusChip } from '../../ui.jsx';
import { isOpen, allPeriods, PAY_METHODS, PLAN_TYPES, STATUS_LABEL } from '../../core/billing.js';
import {
  paymentGroups, paymentsCsv, incomeWeeks, incomeForecast, rangeEarnings, monthView, monthsOutlook, expenseList,
  yearSummary, incomeByStudent, EXPENSE_CATEGORIES, CRITICAL_AFTER_DAYS,
} from '../../core/finance.js';
import { msgPaymentLate, msgPackageFull, msgPaymentReceived } from '../../core/messages.js';
import { fmtTL, parseTL, fmtHours } from '../../core/money.js';
import { fmtDate, fmtShort, fmtMonth, monthKey, monthFirst, addMonths, addDays, monthLast, weekStart } from '../../core/dates.js';
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

const Fig = ({ v, l, s, tone }) => (
  <div class={`figure${tone ? ' t-' + tone : ''}`}><div class="v">{v}</div><div class="l">{l}</div>{s ? <div class="s">{s}</div> : null}</div>
);

/* ───────────── Ödemeler */
const PAY_TABS = [
  ['upcoming', 'Yaklaşan', 'Ödeme tarihi henüz gelmemiş dönemler (öğrenci başına en yakın ödeme).'],
  ['due', 'Ödeme zamanı', 'Vadesi geldi; hatırlatma günü henüz geçmedi.'],
  ['late', 'Gecikmiş', 'Hatırlatma günü geçti.'],
  ['critical', 'Kritik', `Hatırlatma gününden ${CRITICAL_AFTER_DAYS} günden fazla geçmiş ödemeler.`],
  ['paid', 'Ödenen', 'Borcu tamamen kapanmış dönemler.'],
  ['history', 'Kayıtlar', 'Alınan tüm ödemeler (kısmi ödemeler ayrı satırdır).'],
];

function Payments() {
  const { data, periods, now, store, reload } = useApp();
  const [run] = useAction();
  const [view, setView] = useState('auto');
  const [paying, setPaying] = useState(null);
  const byId = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  const perByKey = useMemo(() => new Map(periods.map((p) => [p.key, p])), [periods]);
  const groups = useMemo(() => paymentGroups(periods, now.date), [periods, now.date]);
  const history = data.payments.filter((p) => !p.deleted_at).sort((a, b) => b.paid_date.localeCompare(a.paid_date) || String(b.created_at).localeCompare(String(a.created_at)));
  const sum = (xs) => xs.reduce((a, p) => a + p.remaining, 0);
  const counts = { ...Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), history: history.length };
  // İlk açılışta dolu olan en acil sekme seçilsin
  const first = ['critical', 'late', 'due', 'upcoming'].find((k) => counts[k]) || 'upcoming';
  const tab = view === 'auto' ? first : view;
  const meta = PAY_TABS.find((t) => t[0] === tab);

  const delPay = (p) => confirm(`${fmtTL(p.amount)} ödeme kaydı silinsin mi? İlgili dönemin borcu yeniden açılır.`) && run(async () => { await store.update('payments', p.id, { deleted_at: new Date().toISOString() }); await reload(); }, 'Ödeme silindi');
  const csv = () => {
    const blob = new Blob([paymentsCsv(data.payments, data.students, periods, PAY_METHODS)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `odemeler-${now.date}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div class="stack">
      <div class="card figures">
        <Fig v={fmtTL(sum(groups.critical))} l="Kritik gecikmiş" tone={groups.critical.length ? 'bad' : ''} />
        <Fig v={fmtTL(sum(groups.late))} l="Gecikmiş" tone={groups.late.length ? 'warn' : ''} />
        <Fig v={fmtTL(sum(groups.due))} l="Ödeme zamanı gelen" />
        <Fig v={fmtTL(sum(periods.filter((p) => (p.status === 'running' || p.status === 'future') && p.remaining > 0 && p.due <= addDays(now.date, 14))))} l="14 gün içinde gelecek" />
      </div>
      <Seg cls="many" options={PAY_TABS.map(([k, t]) => [k, `${t} ${counts[k] ?? 0}`])} value={tab} onChange={setView} />
      <div class="hint" style="padding:0 4px">{meta[2]}</div>
      {tab !== 'history' ? (
        <>
          {tab !== 'paid' && groups[tab].length > 0 && <div class="sumline">Toplam kalan: <b class="num">{fmtTL(sum(groups[tab]))}</b> · {groups[tab].length} kayıt</div>}
          <div class="card">
            {groups[tab].length === 0 ? <Empty title={{ upcoming: 'Yaklaşan ödeme yok', due: 'Ödeme zamanı gelen yok', late: 'Gecikmiş ödeme yok 👍', critical: 'Kritik gecikme yok 👍', paid: 'Henüz tamamen ödenmiş dönem yok' }[tab]} /> : (
              <ul class="list">
                {groups[tab].map((p) => {
                  const s = byId.get(p.student_id);
                  return (
                    <li key={p.key} class="stack">
                      <PeriodBody p={p} />
                      {tab !== 'paid' && (
                        <div class="row wrap">
                          <button class="btn small primary" onClick={() => setPaying(p)}>Ödeme al</button>
                          {p.status === 'late' && <WaButton small phone={s?.parent_phone} text={msgPaymentLate(p)} label="Hatırlat" />}
                          {p.status === 'due' && <WaButton small phone={s?.parent_phone} text={msgPackageFull(p)} label="Paket doldu mesajı" />}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          <div class="spread" style="padding:0 4px">
            <span class="small muted">{history.length} kayıt · toplam {fmtTL(history.filter((p) => p.method !== 'indirim').reduce((a, p) => a + p.amount, 0))}</span>
            {history.length > 0 && <button class="btn small ghost" onClick={csv}>⬇ CSV (Excel)</button>}
          </div>
          <div class="card">
            {history.length === 0 ? <Empty title="Henüz ödeme kaydı yok" /> : (
              <div class="table-wrap"><table class="t">
                <thead><tr><th>Tarih</th><th>Öğrenci</th><th>Dönem</th><th class="n">Tutar</th><th /></tr></thead>
                <tbody>{history.slice(0, 300).map((p) => {
                  const d = perByKey.get(p.period_key);
                  return (
                    <tr key={p.id}>
                      <td style="white-space:nowrap">{fmtShort(p.paid_date)}</td>
                      <td>{byId.get(p.student_id)?.name || '—'}<div class="small muted">{PAY_METHODS[p.method] || p.method}{p.note ? ` · ${p.note}` : ''}</div></td>
                      <td class="small">{d ? periodRange(d) : '—'}</td>
                      <td class="n num">{fmtTL(p.amount)}</td>
                      <td><button class="btn small ghost danger" aria-label="Sil" onClick={() => delPay(p)}><Icon name="trash" /></button></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </div>
        </>
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
    if (date > now.date && !confirm('Ödeme tarihi ileri bir gün. Yine de kaydedilsin mi?')) return;
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
            {method !== 'indirim' && <WaButton phone={s?.parent_phone} text={msgPaymentReceived(done)} label="Veliye teşekkür mesajı" />}
            <button class="btn" onClick={onClose}>Tamam</button>
          </div>
        </div>
      ) : (
        <div class="stack">
          <div class="card card-pad"><PeriodBody p={period} /></div>
          <div class="kv4">
            <div><span>Tutar</span><b>{fmtTL(period.amount)}</b></div>
            <div><span>Ödenen</span><b>{fmtTL(period.paid)}</b></div>
            <div><span>Kalan borç</span><b>{fmtTL(period.remaining)}</b></div>
          </div>
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
  const { data, periods, now, settings } = useApp();
  const [openWeek, setOpenWeek] = useState(weekStart(now.date));
  const [offset, setOffset] = useState(0);
  const forecast = useMemo(() => incomeForecast(periods, now.date), [periods, now.date]);
  const { rows, overdue_total } = useMemo(() => {
    // İleri kaydırınca gösterilen son haftaya kadar dönemleri üret (tahmin eksik kalmasın)
    const last = addDays(weekStart(now.date), (offset + 8) * 7 + 6);
    const ps = offset > 0 ? allPeriods(data, now.date, settings, last) : periods;
    return incomeWeeks(ps, data.payments, now.date, { offset });
  }, [periods, data, now.date, settings, offset]);
  const cur = incomeWeeks(periods, data.payments, now.date).rows.find((r) => r.is_current);
  const next4 = forecast.slice(1).reduce((a, f) => a + f.remaining, 0);
  const total = rows.reduce((a, w) => ({ e: a.e + w.expected, c: a.c + w.collected, o: a.o + w.overdue }), { e: 0, c: 0, o: 0 });
  const fmax = Math.max(1, ...forecast.map((f) => f.remaining));

  return (
    <div class="stack">
      <div class="card figures">
        <Fig v={fmtTL(cur.target)} l="Bu hafta hedef" s={cur.target > cur.remaining ? 'gecikmişler dahil' : 'vadesi bu hafta olan'} />
        <Fig v={fmtTL(cur.cash)} l="Bu hafta kasaya giren" tone={cur.cash ? 'ok' : ''} />
        <Fig v={fmtTL(next4)} l="Sonraki 4 hafta beklenen" />
        <Fig v={fmtTL(overdue_total)} l="Geciken alacak" tone={overdue_total ? 'bad' : ''} />
      </div>

      <RangeEarnings />

      <div class="section-head"><h2 class="section-title">Gelecek gelir tahmini</h2><span class="muted small">pasif öğrenciler hariç</span></div>
      <div class="card card-pad">
        <div class="fc-bars" role="img" aria-label="5 haftalık beklenen tahsilat grafiği">
          {forecast.map((f, i) => (
            <div key={f.week_start} class={`fc-col${i === 0 ? ' now' : ''}`}>
              <span class="fc-val num">{f.remaining ? fmtTL(f.remaining) : '0'}</span>
              <div class="fc-track"><i style={`height:${f.remaining ? Math.max(Math.round((f.remaining / fmax) * 100), 3) : 0}%`} /></div>
              <span class="fc-lbl">{f.name}</span>
              <small class="muted">{fmtShort(f.week_start)}</small>
            </div>
          ))}
        </div>
        <ul class="list" style="margin-top:10px">
          {forecast.map((f) => (
            <li key={f.week_start} class="spread small">
              <span>{f.name} <span class="muted">({fmtShort(f.week_start)} – {fmtShort(f.week_end)})</span>{f.students ? <span class="muted"> · {f.students} öğrenci</span> : null}</span>
              <span class="num">{fmtTL(f.remaining)}{f.expected > f.remaining ? <span class="muted"> / {fmtTL(f.expected)}</span> : null}</span>
            </li>
          ))}
        </ul>
      </div>

      <div class="section-head"><h2 class="section-title">Hafta hafta</h2></div>
      <div class="row wrap">
        <button class="btn small" onClick={() => setOffset(offset - 4)}><Icon name="back" size={16} /> 4 hafta önce</button>
        {offset !== 0 && <button class="btn small" onClick={() => setOffset(0)}>Bugüne dön</button>}
        <button class="btn small" onClick={() => setOffset(offset + 4)}>4 hafta sonra <Icon name="chevron" size={16} /></button>
      </div>
      <div class="hint" style="padding:0 4px">Gösterilen 13 hafta: beklenen <b>{fmtTL(total.e)}</b> · tahsil <b>{fmtTL(total.c)}</b> · geciken <b>{fmtTL(total.o)}</b>. Her dönem, vadesinin düştüğü haftada görünür; haftaya dokunursanız ayrıntı açılır.</div>
      <div class="weeks">
        {rows.map((w) => <WeekCard key={w.week_start} w={w} open={openWeek === w.week_start} onToggle={() => setOpenWeek(openWeek === w.week_start ? null : w.week_start)} />)}
      </div>
    </div>
  );
}

function WeekCard({ w, open, onToggle }) {
  const hasBacklog = w.is_current && w.target > w.remaining;
  const empty = w.expected === 0 && w.cash === 0 && !hasBacklog;
  const head = w.cash > 0 ? <span class="chip ok">Gelir var {fmtTL(w.cash)}</span>
    : (w.expected > 0 || hasBacklog) ? <span class="chip warn">{w.is_past ? 'Tahsil edilmedi' : 'Bekleniyor'}</span> : <span class="chip info">Gelir yok</span>;
  return (
    <div class={`week card${w.is_current ? ' current' : ''}${w.overdue ? ' has-late' : ''}`}>
      <button class="week-head" aria-expanded={open} onClick={onToggle}>
        <div class="grow" style="text-align:left">
          <div class="item-title">{fmtShort(w.week_start)} – {fmtShort(w.week_end)} {w.is_current ? <span class="chip info" style="margin-left:4px">bu hafta</span> : null}</div>
          <div class="row wrap" style="gap:6px;margin-top:4px">{head}</div>
        </div>
        <div class="right">
          <div class="num" style="font-size:19px">{fmtTL(hasBacklog ? w.target : w.expected)}</div>
          <div class="small muted">{hasBacklog ? 'hedef' : 'beklenen'}</div>
        </div>
      </button>
      {open && (empty ? <div class="small muted" style="padding:0 16px 14px">Bu haftaya vadesi düşen ödeme yok.</div> : (
        <div style="padding:0 16px 14px">
          <div class="kv4">
            <div><span>Beklenen (vadesi bu hafta)</span><b>{fmtTL(w.expected)}</b></div>
            {hasBacklog && <div><span>Hedef (+ geçmişten kalan gecikmiş)</span><b style="color:var(--madder)">{fmtTL(w.target)}</b></div>}
            <div><span>Tahsil edilen</span><b style="color:var(--sage)">{fmtTL(w.collected)}</b></div>
            <div><span>Geciken</span><b style={w.overdue ? 'color:var(--madder)' : ''}>{fmtTL(w.overdue)}</b></div>
            <div><span>Kalan</span><b>{fmtTL(w.remaining)}</b></div>
            <div><span>Tahsilat oranı</span><b>{w.rate === null ? '—' : `%${w.rate}`}</b></div>
            <div><span>Kasaya giren (o hafta)</span><b>{fmtTL(w.cash)}</b></div>
          </div>
          {w.rate !== null && <div class="bar-track" aria-hidden="true"><i style={`width:${Math.min(w.rate, 100)}%`} /></div>}
          {w.items.length > 0 && (
            <ul class="list" style="margin-top:8px">
              {w.items.map((p) => (
                <li key={p.key} class="spread small">
                  <span>{p.student_name}<span class="muted"> · {PLAN_TYPES[p.type]} · vade {fmtShort(p.due)}</span></span>
                  <span class="row" style="gap:6px"><span class="num">{fmtTL(p.amount)}</span><StatusChip status={p.status} label={p.remaining && p.paid ? `kalan ${fmtTL(p.remaining)}` : STATUS_LABEL[p.status]} /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** Tarih aralığında kazancım: alınan, beklenen, yapılan derslerin kazancı, kalan derslerin kazancı */
function RangeEarnings() {
  const { data, periods, now, settings } = useApp();
  const ws = weekStart(now.date), mk = monthKey(now.date), prev = monthKey(addMonths(monthFirst(mk), -1));
  const presets = {
    week: [ws, addDays(ws, 6)],
    lastweek: [addDays(ws, -7), addDays(ws, -1)],
    month: [monthFirst(mk), monthLast(mk)],
    lastmonth: [monthFirst(prev), monthLast(prev)],
  };
  const [preset, setPreset] = useState('week');
  const [range, setRange] = useState(presets.week);
  const [showStudents, setShowStudents] = useState(false);
  const pick = (k) => { setPreset(k); setRange(presets[k]); };
  const [from, to] = range;
  const bad = !from || !to || from > to;
  const r = useMemo(() => (bad ? null : rangeEarnings(data, settings, periods, from, to, now)), [data, settings, periods, from, to, now, bad]);

  return (
    <>
      <div class="section-head"><h2 class="section-title">Tarih aralığında kazancım</h2></div>
      <div class="card card-pad stack">
        <Seg cls="four" options={[['week', 'Bu hafta'], ['lastweek', 'Geçen hafta'], ['month', 'Bu ay'], ['lastmonth', 'Geçen ay']]} value={preset} onChange={pick} />
        <div class="grid2">
          <Field label="Başlangıç"><input class="input" type="date" value={from} onInput={(e) => { const v = e.currentTarget.value; setPreset('custom'); setRange(([, t]) => [v, t]); }} /></Field>
          <Field label="Bitiş"><input class="input" type="date" value={to} onInput={(e) => { const v = e.currentTarget.value; setPreset('custom'); setRange(([f]) => [f, v]); }} /></Field>
        </div>
        {bad ? <div class="error">Bitiş tarihi başlangıçtan önce olamaz.</div> : (
          <>
            <div class="figures inner">
              <Fig v={r.received ? fmtTL(r.received) : '0 TL'} l={r.received ? '✓ Alınan ödemeler' : 'Gelir yok'} tone={r.received ? 'ok' : ''} s={`${fmtShort(from)} – ${fmtShort(to)}`} />
              <Fig v={fmtTL(r.earned)} l="Yapılan derslerin kazancı" s={`${fmtHours(r.done_hours)}${r.not_held ? ` · ${r.not_held} yapılmadı` : ''}`} />
              <Fig v={fmtTL(r.planned)} l="Kalan derslerin kazancı" s={r.planned_hours ? `${fmtHours(r.planned_hours)} daha planlı` : 'planlı ders kalmadı'} />
              <Fig v={fmtTL(r.expected)} l="Beklenen tahsilat" s={r.expected_remaining ? `vadesi bu aralıkta · ${fmtTL(r.expected_remaining)} ödenmedi` : 'vadesi bu aralıkta'} />
            </div>
            <div class="hint">Toplam kazanç (yapılan + kalan dersler): <b>{fmtTL(r.earned + r.planned)}</b>. Kazanç = ders sayısı × o dönemin 1 derslik ücreti; yapılmayan dersler sayılmaz.</div>
            {r.students.length > 0 && (
              <>
                <button class="btn small ghost" onClick={() => setShowStudents(!showStudents)}>{showStudents ? 'Öğrenci dökümünü gizle' : `Öğrenci bazında göster (${r.students.length})`}</button>
                {showStudents && (
                  <div class="table-wrap"><table class="t">
                    <thead><tr><th>Öğrenci</th><th class="n">Yapılan</th><th class="n">Kalan</th><th class="n">Alınan</th></tr></thead>
                    <tbody>{r.students.map((x) => (
                      <tr key={x.student_id}><td>{x.name}{x.hours ? <div class="small muted">{fmtHours(x.hours)}</div> : null}</td><td class="n num">{fmtTL(x.earned)}</td><td class="n num">{fmtTL(x.planned)}</td><td class="n num">{fmtTL(x.received)}</td></tr>
                    ))}</tbody>
                  </table></div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ───────────── Muhasebe */
const ADV_ICON = { bad: '🔴', warn: '🟠', ok: '🟢', info: 'ℹ️' };

function Accounting() {
  const { data, periods, now, settings, store, reload } = useApp();
  const [run] = useAction();
  const [month, setMonth] = useState(monthKey(now.date));
  const [editing, setEditing] = useState(null);      // {} = yeni, gider = düzenle
  const [paying, setPaying] = useState(null);
  const [cashText, setCashText] = useState(settings.cash_on_hand ? String(settings.cash_on_hand / 100).replace('.', ',') : '');
  const input = { periods, payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments, settings };
  const mv = useMemo(() => monthView(input, month, now.date), [periods, data, month, now.date, settings]);
  const outlook = useMemo(() => monthsOutlook(input, now.date, 3), [periods, data, now.date, settings]);
  const exList = useMemo(() => expenseList(data.expenses, now.date), [data.expenses, now.date]);
  const year = useMemo(() => yearSummary({ payments: data.payments, expenses: data.expenses, expensePayments: data.expense_payments }, now.date), [data, now.date]);
  const byStudent = incomeByStudent(data.students, data.payments, monthFirst(month), monthLast(month));
  const max = Math.max(1, ...year.map((y) => Math.max(y.income, y.expense)));
  const shift = (n) => setMonth(monthKey(addMonths(monthFirst(month), n)));
  const S = mv.summary;
  const wmax = Math.max(1, ...mv.weeks.map((w) => Math.max(w.received + w.expected, w.expenses)));

  const unpay = (i) => confirm(`${i.name} için "ödendi" işareti kaldırılsın mı?`) && run(async () => { await store.remove('expense_payments', i.payment_id); await reload(); }, 'Ödendi işareti kaldırıldı');
  const delExp = (e) => confirm(`"${e.name}" gideri tamamen silinsin mi? (Geçmiş ödeme kayıtları da silinir.)`) && run(async () => { await store.remove('expenses', e.id); await reload(); }, 'Gider silindi');
  const saveCash = (ev) => {
    ev.preventDefault();
    const k = cashText.trim() === '' ? 0 : parseTL(cashText);
    if (Number.isNaN(k)) return alert('Geçerli bir tutar yazın.');
    run(async () => { await store.upsertSettings({ cash_on_hand: k }); await reload(); }, 'Hesap güncellendi');
  };

  return (
    <div class="stack">
      <div class="card card-pad spread">
        <button class="btn small" aria-label="Önceki ay" onClick={() => shift(-1)}><Icon name="back" /></button>
        <div style="text-align:center">
          <div class="num" style="font-size:20px">{mv.label}</div>
          {!mv.is_current && <button class="btn small ghost" onClick={() => setMonth(monthKey(now.date))}>Bu aya dön</button>}
        </div>
        <button class="btn small" aria-label="Sonraki ay" onClick={() => shift(1)}><Icon name="chevron" /></button>
      </div>
      {mv.partial && <div class="advice"><div class="warn">Bu ay yaklaşık 2 aydan uzak: gelecek tahsilat tahmini eksik olabilir (dönemler yaklaşık 2 ay ilerisine kadar hesaplanır).</div></div>}

      <div class="card figures">
        <Fig v={fmtTL(S.expenses_total)} l="Gider toplamı" s={`Ödenen ${fmtTL(S.expenses_paid)} · Kalan ${fmtTL(S.expenses_unpaid)}`} />
        {!mv.is_future && <Fig v={fmtTL(S.received)} l="Bu ay tahsil edilen" s="Bu ay alınan tüm ödemeler" tone="ok" />}
        {!mv.is_past && <Fig v={fmtTL(S.expected)} l="Ayın kalanında beklenen" s="Vadesi bu ayın kalanına düşen" />}
        {!mv.is_future && <Fig v={fmtTL(S.more_needed)} l="Daha gelmesi gereken" s="Giderleri karşılamak için" tone={S.more_needed ? 'warn' : ''} />}
        {!mv.is_future && <Fig v={fmtTL(Math.abs(S.gap))} l={S.gap < 0 ? 'Ayın açığı' : 'Ayın fazlası'} s={mv.is_past ? 'Tahsilat − gider' : 'Alınan + beklenen − gider'} tone={S.gap < 0 ? 'bad' : 'ok'} />}
        {!mv.is_past && <Fig v={S.extra ? fmtTL(S.extra) : 'Yok ✓'} l="Ek para ihtiyacı (en az)" s={S.extra ? `En sıkışık gün: ${fmtDate(S.extra_date)}` : 'Ödemeler zamanında karşılanıyor'} tone={S.extra ? 'bad' : 'ok'} />}
      </div>

      <div class="section-head"><h2 class="section-title">💡 Tavsiyeler</h2></div>
      <div class="advice">{mv.advice.map((a, i) => <div key={i} class={a.level === 'bad' ? 'bad' : a.level}><span aria-hidden="true">{ADV_ICON[a.level]} </span>{a.text}</div>)}</div>
      {!mv.is_past && (
        <form class="card card-pad row wrap" onSubmit={saveCash}>
          <label class="grow"><b>Elinizdeki para</b> <span class="small muted">(isteğe bağlı: hesap + nakit)</span>
            <input class="input" inputMode="decimal" placeholder="0" value={cashText} onInput={(e) => setCashText(e.currentTarget.value)} style="margin-top:6px" />
          </label>
          <button class="btn" type="submit">Hesabı güncelle</button>
        </form>
      )}

      <div class="section-head"><h2 class="section-title">Önümüzdeki aylar</h2><span class="muted small">bugünden itibaren</span></div>
      <div class="card"><div class="table-wrap"><table class="t">
        <thead><tr><th>Ay</th><th class="n">Gider</th><th class="n">Gelen + beklenen</th><th class="n">Fark</th><th>Durum</th></tr></thead>
        <tbody>{outlook.map((o) => (
          <tr key={o.month} class={o.month === month ? 'current' : ''} style="cursor:pointer" onClick={() => setMonth(o.month)}>
            <td>{o.label}{o.partial ? <div class="small muted">tahmin eksik olabilir</div> : null}</td>
            <td class="n num">{fmtTL(o.expenses)}</td>
            <td class="n num">{fmtTL(o.received + o.expected)}</td>
            <td class="n num" style={`color:${o.gap >= 0 ? 'var(--sage)' : 'var(--madder)'}`}>{fmtTL(o.gap, { sign: true })}</td>
            <td>{o.extra ? <span class="chip bad">{fmtTL(o.extra)} ek para gerek</span> : <span class="chip ok">Paraya ihtiyaç yok</span>}</td>
          </tr>
        ))}</tbody>
      </table></div></div>
      <div class="hint" style="padding:0 4px">Fark: o ayın kendi geliri − gideri. Ek para: bugünden o ayın sonuna kadar, önceki ayların ödenmemiş giderleri de dahil, ödemeleri zamanında yapmak için en sıkışık anda gereken en az tutar. Satıra dokunursanız o ay açılır.</div>

      <div class="section-head"><h2 class="section-title">{mv.label} hafta hafta</h2>
        <div class="legend"><span><i style="background:var(--sage)" />Gelen / beklenen</span><span><i style="background:var(--brass)" />Gider</span></div>
      </div>
      <div class="card card-pad">
        <div class="bars" role="img" aria-label="Haftalık gelir ve gider">
          {mv.weeks.map((w) => (
            <div key={w.week_start} class="bar" title={`${fmtShort(w.from)} – ${fmtShort(w.to)}: gelen ${fmtTL(w.received)}, beklenen ${fmtTL(w.expected)}, gider ${fmtTL(w.expenses)}`}>
              <i class="inc" style={`height:${((w.received + w.expected) / wmax) * 100}%;width:62%`} />
              <i class="exp" style={`height:${(w.expenses / wmax) * 100}%`} />
            </div>
          ))}
        </div>
        <div class="bar-labels">{mv.weeks.map((w) => <span key={w.week_start}>{fmtShort(w.from).split(' ')[0]}–{fmtShort(w.to)}</span>)}</div>
        <div class="table-wrap" style="margin-top:12px"><table class="t">
          <thead><tr><th>Hafta</th><th class="n">Gelen</th><th class="n">Beklenen</th><th class="n">Gider</th><th class="n">Net</th><th class="n">Hafta sonu kasa</th></tr></thead>
          <tbody>{mv.weeks.map((w) => (
            <tr key={w.week_start} class={w.is_current ? 'current' : ''}>
              <td style="white-space:nowrap">{fmtShort(w.from)} – {fmtShort(w.to)}</td>
              <td class="n num">{w.received ? fmtTL(w.received) : '—'}</td>
              <td class="n num">{w.expected ? fmtTL(w.expected) : '—'}</td>
              <td class="n num">{w.expenses ? fmtTL(w.expenses) : '—'}</td>
              <td class="n num" style={`color:${w.net >= 0 ? 'var(--sage)' : 'var(--madder)'}`}>{fmtTL(w.net, { sign: true })}</td>
              <td class="n num" style={w.balance !== null && w.balance < 0 ? 'color:var(--madder);font-weight:700' : ''}>{w.balance === null ? '—' : fmtTL(w.balance)}</td>
            </tr>
          ))}
          <tr><td><b>Toplam</b></td><td class="n num"><b>{fmtTL(S.received)}</b></td><td class="n num"><b>{fmtTL(S.expected)}</b></td><td class="n num"><b>{fmtTL(S.expenses_total)}</b></td><td class="n num"><b>{fmtTL(S.gap, { sign: true })}</b></td><td /></tr>
          </tbody>
        </table></div>
        <div class="hint" style="margin-top:8px">Gelen: o hafta alınan ödemeler. Beklenen: vadesi o haftaya düşen, henüz ödenmemiş tutar (bugünden sonrası). Hafta sonu kasa: elinizdeki para + gelenler − giderler (gecikmiş alacaklar hariç).</div>
      </div>

      <div class="section-head"><h2 class="section-title">{mv.label} giderleri</h2><button class="btn small" onClick={() => setEditing({})}><Icon name="plus" /> Gider ekle</button></div>
      <div class="card">
        {mv.expenses.length === 0 ? <Empty title="Bu ay için gider kalemi yok" /> : (
          <ul class="list">
            {mv.expenses.map((i) => (
              <li key={i.expense_id} class="spread">
                <div class="grow">
                  <div class="item-title">{i.name}</div>
                  <div class="item-sub">{fmtShort(i.due_date)} · {i.category} · {i.one_time ? 'tek seferlik' : 'her ay'}{i.note ? ` · ${i.note}` : ''}</div>
                  <div style="margin-top:4px"><ExpenseStatus i={i} past={mv.is_past} /></div>
                </div>
                <div class="right">
                  <div class="num">{fmtTL(i.paid ? i.paid_amount : i.amount)}</div>
                  <div style="margin-top:4px">
                    {i.paid ? <button class="btn small ghost" onClick={() => unpay(i)}>Geri al</button>
                      : <button class="btn small primary" onClick={() => setPaying(i)}>Ödendi ✓</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!mv.is_past && (
        <>
          <div class="section-head"><h2 class="section-title">Nakit akışı</h2><span class="muted small">bugünden ay sonuna</span></div>
          <div class="card">
            {mv.timeline.length === 0 ? <Empty title="Ay sonuna kadar hareket yok" /> : (
              <>
                <BalanceChart cash={S.cash} rows={mv.timeline} from={now.date} to={monthLast(month) < now.date ? now.date : monthLast(month)} />
                <div class="table-wrap"><table class="t">
                  <thead><tr><th>Tarih</th><th>Kalem</th><th class="n">Tutar</th><th class="n">Kalan para</th></tr></thead>
                  <tbody>
                    <tr><td style="white-space:nowrap">{fmtShort(now.date)}</td><td>Elinizdeki para</td><td /><td class="n num"><b>{fmtTL(S.cash)}</b></td></tr>
                    {mv.timeline.map((r, i) => (
                      <tr key={i}>
                        <td style="white-space:nowrap">{fmtShort(r.date)}</td>
                        <td>
                          <span class={`chip ${r.kind === 'in' ? 'ok' : 'warn'}`} style="margin-right:6px">{r.kind === 'in' ? 'Gelir' : 'Gider'}</span>
                          {r.kind === 'in' ? `${r.name} ödemesi` : r.name}
                          {r.late ? <span class="chip bad" style="margin-left:6px">gecikmiş gider</span> : null}
                          {r.plan_type === 'oneoff' ? <span class="chip info" style="margin-left:6px">tek ödeme</span> : r.plan_type === 'monthly' ? <span class="chip info" style="margin-left:6px">aylık</span> : null}
                          {r.kind === 'out' && (r.covered ? <div class="small" style="color:var(--sage)">Karşılanıyor</div> : <div class="small" style="color:var(--madder)">{fmtTL(r.short)} eksik</div>)}
                        </td>
                        <td class="n num" style={`color:${r.kind === 'in' ? 'var(--sage)' : 'var(--text)'}`}>{r.kind === 'in' ? '+' : '−'}{fmtTL(r.amount)}</td>
                        <td class="n num" style={r.balance < 0 ? 'color:var(--madder);font-weight:700' : ''}>{fmtTL(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </>
            )}
          </div>
          <div class="hint" style="padding:0 4px">Tahsilatlar vade gününde gelmiş sayılır (temkinli). Vadesi geçmiş alacaklar bu tabloya girmez; tavsiyelerde ayrıca değerlendirilir.</div>
        </>
      )}

      <div class="section-head"><h2 class="section-title">Rutin giderlerim</h2><button class="btn small" onClick={() => setEditing({})}><Icon name="plus" /> Gider ekle</button></div>
      <div class="card">
        {exList.items.length === 0 ? (
          <Empty title="Henüz gider yok" action={<button class="btn primary" onClick={() => setEditing({})}>İlk gideri ekle</button>}>Kira, fatura, ulaşım gibi her ay tekrarlayan giderlerinizi ekleyin.</Empty>
        ) : (
          <>
            <ul class="list">
              {exList.items.map((e) => (
                <li key={e.id} class="spread" style={e.running_now ? '' : 'opacity:.6'}>
                  <div class="grow">
                    <div class="item-title">{e.name} {e.active === false ? <span class="chip info">pasif</span> : e.ended ? <span class="chip info">bitti</span> : null}</div>
                    <div class="item-sub">{e.category || 'Diğer'} · {e.one_time ? `tek seferlik (${fmtMonth(e.start_month)})` : `her ayın ${e.due_day}. günü · ${fmtMonth(e.start_month)} → ${e.end_month ? fmtMonth(e.end_month) : 'süresiz'}`}</div>
                    {e.note ? <div class="item-sub">{e.note}</div> : null}
                  </div>
                  <div class="right">
                    <div class="num">{fmtTL(e.amount)}</div>
                    <div class="row" style="justify-content:flex-end;gap:4px;margin-top:4px">
                      <button class="btn small ghost" aria-label="Düzenle" onClick={() => setEditing(e)}><Icon name="edit" /></button>
                      <button class="btn small ghost danger" aria-label="Sil" onClick={() => delExp(e)}><Icon name="trash" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div class="spread card-pad" style="border-top:1px solid var(--line)"><b>Aylık toplam (aktif, her ay)</b><b class="num">{fmtTL(exList.recurring_total)}</b></div>
          </>
        )}
      </div>

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

      <div class="section-head"><h2 class="section-title">Öğrenci bazında tahsilat</h2><span class="muted small">{mv.label}</span></div>
      <div class="card">
        {byStudent.length === 0 ? <Empty title="Bu ay tahsilat yok" /> : (
          <ul class="list">{byStudent.map((r) => <li key={r.student_id} class="spread"><span>{r.name}</span><span class="num">{fmtTL(r.total)}</span></li>)}</ul>
        )}
      </div>
      {editing && <ExpenseSheet month={month} expense={editing.id ? editing : null} onClose={() => setEditing(null)} />}
      {paying && <ExpensePaySheet inst={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function ExpenseStatus({ i, past }) {
  if (i.paid) return <span class="chip ok">Ödendi {fmtShort(i.paid_date)}</span>;
  if (past) return <span class="chip info">İşaretlenmemiş</span>;
  const late = i.overdue ? <span class="chip bad" style="margin-left:6px">gecikmiş</span> : null;
  if (i.covered === false) return <><span class="chip bad">Karşılanmıyor · {fmtTL(i.short)} eksik</span>{late}</>;
  if (i.covered === true) return <><span class="chip ok">Karşılanıyor</span>{late}</>;
  return <><span class="chip info">Ödenmedi</span>{late}</>;
}

/** Kasa bakiyesi çizgisi: bugünden ay sonuna, sıfırın altı kırmızı */
function BalanceChart({ cash, rows, from, to }) {
  const W = 600, H = 150, P = 10;
  const days = Math.max(1, (new Date(to) - new Date(from)) / 86400000);
  const x = (d) => P + ((new Date(d) - new Date(from)) / 86400000 / days) * (W - 2 * P);
  const vals = [cash, ...rows.map((r) => r.balance)];
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), span = hi - lo || 1;
  const y = (v) => P + ((hi - v) / span) * (H - 2 * P);
  // basamaklı çizgi: bakiye bir sonraki harekete kadar sabit kalır
  let d = `M${x(from)},${y(cash)}`, bal = cash;
  for (const r of rows) { d += ` H${x(r.date)} V${y(r.balance)}`; bal = r.balance; }
  d += ` H${x(to)}`;
  const minRow = rows.reduce((m, r) => (r.balance < m.balance ? r : m), { balance: cash, date: from });
  return (
    <div class="card-pad" style="padding-bottom:6px">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style="width:100%;height:150px;display:block" role="img" aria-label="Kasa bakiyesi grafiği">
        <defs><clipPath id="neg"><rect x="0" y={y(0)} width={W} height={H} /></clipPath><clipPath id="pos"><rect x="0" y="0" width={W} height={y(0)} /></clipPath></defs>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="var(--sage)" stroke-width="2.5" clip-path="url(#pos)" vector-effect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="var(--madder)" stroke-width="2.5" clip-path="url(#neg)" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="spread small muted"><span>{fmtShort(from)}</span><span>En düşük: <b style={minRow.balance < 0 ? 'color:var(--madder)' : ''}>{fmtTL(minRow.balance)}</b> ({fmtShort(minRow.date)})</span><span>{fmtShort(to)} · {fmtTL(bal)}</span></div>
    </div>
  );
}

function ExpenseSheet({ month, expense, onClose }) {
  const { store, reload } = useApp();
  const [run, busy] = useAction();
  const e0 = expense;
  const [f, setF] = useState(e0 ? {
    name: e0.name, category: e0.category || 'Diğer', amount: String(e0.amount / 100).replace('.', ','), due_day: String(e0.due_day || 1),
    repeat: e0.end_month && e0.end_month === e0.start_month ? 'once' : 'monthly', start_month: e0.start_month, end_month: e0.end_month || '', note: e0.note || '', active: e0.active !== false,
  } : { name: '', category: 'Kira', amount: '', due_day: '1', repeat: 'monthly', start_month: month, end_month: '', note: '', active: true });
  const [err, setErr] = useState('');
  const set = (k) => (e) => { const v = e.currentTarget.value; setF((o) => ({ ...o, [k]: v })); };
  const save = async () => {
    const amount = parseTL(f.amount), day = Number(f.due_day);
    if (!f.name.trim()) return setErr('Gider adını yazın.');
    if (!(amount > 0)) return setErr('Geçerli bir tutar yazın.');
    if (!(Number.isInteger(day) && day >= 1 && day <= 31)) return setErr('Ödeme günü 1–31 arası olmalı.');
    if (!f.start_month) return setErr('Başlangıç ayını seçin.');
    if (f.repeat === 'monthly' && f.end_month && f.end_month < f.start_month) return setErr('Bitiş ayı başlangıçtan önce olamaz.');
    const row = { name: f.name.trim(), category: f.category, amount, due_day: day, start_month: f.start_month, end_month: f.repeat === 'once' ? f.start_month : f.end_month || null, active: f.active, note: f.note.trim() };
    const ok = await run(async () => {
      if (e0) await store.update('expenses', e0.id, row);
      else await store.insert('expenses', { ...row, deleted_at: null });
      await reload();
    }, e0 ? 'Gider güncellendi' : 'Gider eklendi');
    if (ok) onClose();
  };
  return (
    <Sheet title={e0 ? 'Gideri düzenle' : 'Gider ekle'} onClose={onClose}>
      <div class="stack">
        <Field label="Gider adı" required><input class="input" value={f.name} onInput={set('name')} placeholder="Ör. Kira, Elektrik, İnternet" /></Field>
        <div class="grid2">
          <Field label="Kategori"><select class="input" value={f.category} onChange={set('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Tutar (TL)" required><input class="input" inputMode="decimal" value={f.amount} onInput={set('amount')} placeholder="Ör. 15.000" /></Field>
        </div>
        <Seg options={[['monthly', 'Her ay'], ['once', 'Tek seferlik']]} value={f.repeat} onChange={(repeat) => setF((o) => ({ ...o, repeat }))} />
        <div class="grid3">
          <Field label="Her ayın kaçında?" hint="31: kısa aylarda son gün"><input class="input" inputMode="numeric" value={f.due_day} onInput={set('due_day')} /></Field>
          <Field label={f.repeat === 'once' ? 'Ay' : 'Başlangıç ayı'}><input class="input" type="month" value={f.start_month} onInput={set('start_month')} /></Field>
          {f.repeat === 'monthly' && <Field label="Bitiş ayı" hint="Boş: süresiz (taksitte son ay)"><input class="input" type="month" value={f.end_month} onInput={set('end_month')} /></Field>}
        </div>
        <Field label="Not (isteğe bağlı)"><input class="input" value={f.note} onInput={set('note')} /></Field>
        <label class="row" style="gap:8px"><input type="checkbox" checked={f.active} onChange={(e) => setF((o) => ({ ...o, active: e.currentTarget.checked }))} /> Aktif (planlamaya dahil)</label>
        {err && <div class="error">{err}</div>}
        <button class="btn primary block" disabled={busy} onClick={save}>{e0 ? 'Kaydet' : 'Gideri ekle'}</button>
      </div>
    </Sheet>
  );
}

function ExpensePaySheet({ inst, onClose }) {
  const { store, reload, now } = useApp();
  const [run, busy] = useAction();
  const [amount, setAmount] = useState(String(inst.amount / 100).replace('.', ','));
  // Geçmiş ayın gideri geç işaretleniyorsa son ödeme günü; yoksa bugün
  const [date, setDate] = useState(inst.month < monthKey(now.date) ? inst.due_date : now.date);
  const [err, setErr] = useState('');
  const save = async () => {
    const k = parseTL(amount);
    if (!(k > 0)) return setErr('Geçerli bir tutar yazın.');
    if (!date) return setErr('Tarih seçin.');
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
        {err && <div class="error">{err}</div>}
        <button class="btn primary block" disabled={busy} onClick={save}>Ödendi olarak kaydet</button>
      </div>
    </Sheet>
  );
}

export { periodRange, fmtDate, isOpen };
