import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <AlertCircle className="h-12 w-12 text-slate-200" />
        </div>
        <h1 className="text-4xl font-bold tracking-tighter text-slate-900">404</h1>
        <p className="text-slate-500 text-lg leading-relaxed">
          The page you are looking for does not exist.
        </p>
        <div className="pt-4">
          <a 
            href="/" 
            className="inline-block text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 hover:text-slate-600 hover:border-slate-600 transition-all"
          >
            Return Home
          </a>
        </div>
      </div>
    </div>
  );
}
