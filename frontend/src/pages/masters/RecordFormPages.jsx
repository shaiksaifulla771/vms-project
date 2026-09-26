import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { ErrorBox, Loading, ModalAsPage } from '../../components/ui';
import { MaterialForm } from './MaterialsPage';
import { MpnForm } from './MpnsPage';

/** Go back if the user came from inside the app, otherwise to the list. */
function useLeave(fallback) {
  const navigate = useNavigate();
  return () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(fallback, { replace: true }));
}

/** Material / product create and edit as a full page: /masters/materials/new, /masters/materials/:id/edit (and /masters/products/...). */
export function MaterialFormPage({ product = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useApp();
  const base = product ? '/masters/products' : '/masters/materials';
  const leave = useLeave(base);
  const { data: m, loading, error } = useData(() => (id ? api.get(`/materials/${id}`, { scoped: false }) : Promise.resolve(null)), [id]);
  if (id && loading && !m) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;
  return (
    <ModalAsPage.Provider value>
      <MaterialForm key={id || 'new'} material={m || undefined} preset={product ? { classification: 'FINISHED_GOOD', uom: 'pcs' } : undefined} onClose={leave}
        onDone={(saved) => {
          const label = product ? 'Product' : 'Material';
          notify(id ? `${label} saved` : `${label} ${saved.code} created`);
          navigate(`${base}/${saved.id || id}`, { replace: true });
        }} />
    </ModalAsPage.Provider>
  );
}

/** MPN create and edit as a full page: /masters/mpns/new?material_id=&vendor_id=, /masters/mpns/:id/edit. */
export function MpnFormPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useApp();
  const leave = useLeave('/masters/mpns');
  const { data: p, loading, error } = useData(() => (id ? api.get(`/mpns/${id}`, { scoped: false }) : Promise.resolve(null)), [id]);
  if (id && loading && !p) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;
  return (
    <ModalAsPage.Provider value>
      <MpnForm key={id || 'new'} mpn={p || undefined} preset={{ material_id: search.get('material_id') || '', vendor_id: search.get('vendor_id') || '' }} onClose={leave}
        onDone={(saved) => { notify(id ? 'MPN saved' : `MPN ${saved.mpn_code} created`); navigate(`/masters/mpns/${saved.id || id}`, { replace: true }); }} />
    </ModalAsPage.Provider>
  );
}
