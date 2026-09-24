import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { COUNTRIES, STATES } from '../../lib/format';
import { ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { Section } from '../../components/masterKit';

const newAddress = (n) => ({ _k: Math.random(), address_name: n === 0 ? 'Head Office' : `Address ${n + 1}`, address_type: n === 0 ? 'PRIMARY' : 'SECONDARY',
  is_default: n === 0, line1: '', line2: '', city: '', state: '', pincode: '', country: 'India', gstin: '' });
const newContact = () => ({ _k: Math.random(), name: '', designation: '', phone: '', email: '' });
const newBank = (n) => ({ _k: Math.random(), account_holder: '', account_number: '', ifsc: '', bank_name: '', branch: '', is_primary: n === 0 });

function RemoveBtn({ onClick, title }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded text-ink-muted hover:text-danger hover:bg-panel"><Trash2 size={14} /></button>
  );
}

export default function VendorFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { notify } = useApp();
  const [f, setF] = useState(isNew ? {
    name: '', status: 'ACTIVE', phone: '', contact_email: '', gstin: '', fssai_no: '', fssai_expiry: '',
    addresses: [newAddress(0)], contacts: [newContact()], bank_accounts: [],
  } : null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.get(`/vendors/${id}?full=true`, { scoped: false }).then((v) => {
      setCode(v.code);
      const keyed = (list) => list.map((x) => ({ ...x, _k: x.id }));
      const blankNull = (o) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, val ?? '']));
      setF({
        name: v.name, status: v.status, phone: v.phone || '', contact_email: v.contact_email || '', gstin: v.gstin || '',
        fssai_no: v.fssai_no || '', fssai_expiry: v.fssai_expiry ? String(v.fssai_expiry).slice(0, 10) : '',
        addresses: keyed(v.addresses).map(blankNull),
        contacts: keyed(v.contacts).map(blankNull),
        bank_accounts: keyed(v.bank_accounts).map(blankNull),
      });
    }).catch((e) => setErr(e.message));
  }, [id, isNew]);

  if (!f) return <><PageHeader title="Edit Vendor" /><div className="p-5"><ErrorBox message={err} />{!err && <Loading />}</div></>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setList = (list, i, patch) => setF((s) => ({ ...s, [list]: s[list].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const onlyOne = (list, i, flag) => setF((s) => ({ ...s, [list]: s[list].map((x, j) => ({ ...x, [flag]: j === i })) }));
  const remove = (list, i, flag) => setF((s) => {
    const next = s[list].filter((_, j) => j !== i);
    if (flag && next.length && !next.some((x) => x[flag])) next[0] = { ...next[0], [flag]: true };
    return { ...s, [list]: next };
  });

  const save = async () => {
    setErr(null); setBusy(true);
    const strip = (list) => list.map(({ _k, id: _id, vendor_id, created_at, updated_at, sort_order, ...x }) => x);
    const body = {
      ...f,
      fssai_expiry: f.fssai_expiry || null,
      addresses: strip(f.addresses),
      contacts: strip(f.contacts).filter((c) => c.name || c.phone || c.email),
      bank_accounts: strip(f.bank_accounts),
    };
    try {
      const v = isNew ? await api.post('/vendors', body, { scoped: false }) : await api.put(`/vendors/${id}`, body, { scoped: false });
      notify(isNew ? `Vendor ${v.code} created` : 'Vendor saved');
      navigate(`/masters/vendors/${v.id}`);
    } catch (e) { setErr(e.message); setBusy(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  return (
    <div>
      <PageHeader title={isNew ? 'New Vendor' : `Edit Vendor ${code}`}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => navigate(isNew ? '/masters/vendors' : `/masters/vendors/${id}`)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
        </>} />
      <div className="p-5 space-y-4 max-w-6xl">
        <ErrorBox message={err} onClose={() => setErr(null)} />

        <Section title="Vendor details">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Vendor Code" hint={isNew ? 'Assigned on save (V1001, ...)' : 'Cannot be changed'}><input className="input" value={isNew ? 'Auto' : code} disabled /></Field>
            <Field label="Vendor Name" required className="col-span-2"><input className="input" value={f.name} onChange={set('name')} autoFocus={isNew} /></Field>
            <Field label="Status"><select className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} placeholder="+91 98xxxxxxxx" /></Field>
            <Field label="Email"><input className="input" type="email" value={f.contact_email} onChange={set('contact_email')} /></Field>
            <Field label="GSTIN" hint="15 characters"><input className="input uppercase" maxLength={15} value={f.gstin} onChange={set('gstin')} /></Field>
            <div />
            <Field label="FSSAI Licence No."><input className="input" maxLength={20} value={f.fssai_no} onChange={set('fssai_no')} /></Field>
            <Field label="FSSAI Expiry"><input className="input" type="date" value={f.fssai_expiry} onChange={set('fssai_expiry')} /></Field>
          </div>
        </Section>

        <Section title="Addresses"
          actions={<button type="button" className="btn-link" onClick={() => setF({ ...f, addresses: [...f.addresses, newAddress(f.addresses.length)] })}><Plus size={13} /> Add another address</button>}>
          {f.addresses.length === 0 && <p className="text-ink-muted text-[13px]">No address yet.</p>}
          <div className="space-y-3">
            {f.addresses.map((a, i) => (
              <div key={a._k} className="border border-line rounded p-3">
                <div className="flex items-end gap-3 mb-3">
                  <Field label="Address Name" required className="w-56"><input className="input font-medium" value={a.address_name} onChange={(e) => setList('addresses', i, { address_name: e.target.value })} /></Field>
                  <Field label="Type" className="w-36">
                    <select className="input" value={a.address_type} onChange={(e) => setList('addresses', i, { address_type: e.target.value })}>
                      <option value="PRIMARY">Primary</option><option value="SECONDARY">Secondary</option>
                    </select>
                  </Field>
                  <label className="flex items-center gap-1.5 h-8 text-[13px] text-ink-soft">
                    <input type="radio" name="default-address" checked={a.is_default} onChange={() => onlyOne('addresses', i, 'is_default')} /> Default
                  </label>
                  <div className="ml-auto"><RemoveBtn title="Remove address" onClick={() => remove('addresses', i, 'is_default')} /></div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Address Line 1" className="col-span-2"><input className="input" value={a.line1} onChange={(e) => setList('addresses', i, { line1: e.target.value })} /></Field>
                  <Field label="Address Line 2" className="col-span-2"><input className="input" value={a.line2} onChange={(e) => setList('addresses', i, { line2: e.target.value })} /></Field>
                  <Field label="City"><input className="input" value={a.city} onChange={(e) => setList('addresses', i, { city: e.target.value })} /></Field>
                  <Field label="State">
                    {(a.country || 'India') === 'India' ? (
                      <select className="input" value={a.state || ''} onChange={(e) => setList('addresses', i, { state: e.target.value })}>
                        <option value="">-</option>
                        {a.state && !STATES.includes(a.state) && <option value={a.state}>{a.state}</option>}
                        {STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    ) : <input className="input" value={a.state} onChange={(e) => setList('addresses', i, { state: e.target.value })} />}
                  </Field>
                  <Field label="PIN Code"><input className="input" maxLength={10} value={a.pincode} onChange={(e) => setList('addresses', i, { pincode: e.target.value })} /></Field>
                  <Field label="Country">
                    <select className="input" value={a.country || ''} onChange={(e) => setList('addresses', i, { country: e.target.value })}>
                      <option value="">-</option>
                      {a.country && !COUNTRIES.includes(a.country) && <option value={a.country}>{a.country}</option>}
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="GSTIN for this address" hint="If different from the vendor GSTIN"><input className="input uppercase" maxLength={15} value={a.gstin} onChange={(e) => setList('addresses', i, { gstin: e.target.value })} /></Field>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Contact directory"
          actions={<button type="button" className="btn-link" onClick={() => setF({ ...f, contacts: [...f.contacts, newContact()] })}><Plus size={13} /> Add contact</button>}>
          {f.contacts.length === 0 && <p className="text-ink-muted text-[13px]">No contacts yet.</p>}
          {f.contacts.length > 0 && (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Name</th><th className="th">Designation</th><th className="th">Phone</th><th className="th">Email</th><th className="th w-10" /></tr></thead>
              <tbody>
                {f.contacts.map((c, i) => (
                  <tr key={c._k}>
                    {['name', 'designation', 'phone', 'email'].map((k) => (
                      <td key={k} className="td px-1"><input className="input" value={c[k]} onChange={(e) => setList('contacts', i, { [k]: e.target.value })} /></td>
                    ))}
                    <td className="td px-1"><RemoveBtn title="Remove contact" onClick={() => remove('contacts', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Bank details"
          actions={<button type="button" className="btn-link" onClick={() => setF({ ...f, bank_accounts: [...f.bank_accounts, newBank(f.bank_accounts.length)] })}><Plus size={13} /> Add bank account</button>}>
          {f.bank_accounts.length === 0 && <p className="text-ink-muted text-[13px]">No bank account yet.</p>}
          {f.bank_accounts.length > 0 && (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Account Holder Name</th><th className="th">Account Number</th><th className="th w-36">IFSC</th><th className="th">Bank Name</th><th className="th">Branch</th><th className="th w-20">Primary</th><th className="th w-10" /></tr></thead>
              <tbody>
                {f.bank_accounts.map((b, i) => (
                  <tr key={b._k}>
                    <td className="td px-1"><input className="input" value={b.account_holder} onChange={(e) => setList('bank_accounts', i, { account_holder: e.target.value })} /></td>
                    <td className="td px-1"><input className="input tabular-nums" inputMode="numeric" value={b.account_number} onChange={(e) => setList('bank_accounts', i, { account_number: e.target.value.replace(/[^0-9]/g, '') })} /></td>
                    <td className="td px-1"><input className="input uppercase" maxLength={11} placeholder="HDFC0001234" value={b.ifsc} onChange={(e) => setList('bank_accounts', i, { ifsc: e.target.value.toUpperCase() })} /></td>
                    <td className="td px-1"><input className="input" value={b.bank_name} onChange={(e) => setList('bank_accounts', i, { bank_name: e.target.value })} /></td>
                    <td className="td px-1"><input className="input" value={b.branch} onChange={(e) => setList('bank_accounts', i, { branch: e.target.value })} /></td>
                    <td className="td text-center"><button type="button" title="Make primary" onClick={() => onlyOne('bank_accounts', i, 'is_primary')}
                      className={b.is_primary ? 'text-accent' : 'text-ink-faint hover:text-ink'}><Star size={15} fill={b.is_primary ? 'currentColor' : 'none'} /></button></td>
                    <td className="td px-1"><RemoveBtn title="Remove bank account" onClick={() => remove('bank_accounts', i, 'is_primary')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <div className="flex justify-end gap-2 pb-6">
          <button type="button" className="btn-secondary" onClick={() => navigate(isNew ? '/masters/vendors' : `/masters/vendors/${id}`)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
