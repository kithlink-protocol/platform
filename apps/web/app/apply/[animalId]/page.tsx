import { ApplyForm } from './apply-form';

export function generateStaticParams() {
  return [{ animalId: 'preview' }];
}
export const dynamicParams = false;

export default function ApplyPage() {
  return <ApplyForm />;
}
