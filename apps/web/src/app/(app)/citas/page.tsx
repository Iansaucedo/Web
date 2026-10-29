import { redirect } from 'next/navigation';

/** Los emails antiguos enlazaban a /citas: las citas están en «Mis órdenes». */
export default function Citas() {
  redirect('/ordenes');
}
