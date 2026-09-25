import VaultDocs from '../components/VaultDocs';
import { Lock } from 'lucide-react';
import { PageHero } from '../components/ui';

export default function Vault() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <PageHero icon={Lock} title="Vault" blurb="Your official records, kept private." />
      <VaultDocs />
      <div className="card p-5 space-y-2">
        <h2 className="text-lg font-semibold text-center">Coming to the Vault</h2>
        <p className="text-sm text-center text-teal">W-2s and pay stubs, benefits and insurance details, and performance evaluations.</p>
        <p className="text-xs text-center text-teal">These hold sensitive numbers, so they will be added after Careering has a second step at sign in and encrypted file storage. Until then, please keep them out of the app.</p>
      </div>
    </div>
  );
}
