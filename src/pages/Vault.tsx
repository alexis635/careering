import VaultDocs from '../components/VaultDocs';

export default function Vault() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-5xl font-bold">Vault</h1>
        <p className="text-teal mt-1">Your official records, kept private.</p>
      </div>
      <VaultDocs />
      <div className="card p-5 space-y-2">
        <h2 className="text-lg font-semibold text-center">Coming to the Vault</h2>
        <p className="text-sm text-center text-teal">W-2s and pay stubs, benefits and insurance details, and performance evaluations.</p>
        <p className="text-xs text-center text-teal">These hold sensitive numbers, so they will be added after Careering has a second step at sign in and encrypted file storage. Until then, please keep them out of the app.</p>
      </div>
    </div>
  );
}
