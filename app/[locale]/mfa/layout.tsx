export default function MfaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="text-2xl font-poppins font-bold text-primary">ClubSOS</span>
        </div>
        {children}
      </div>
    </div>
  );
}
