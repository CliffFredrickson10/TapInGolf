import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { HnaPendingProvider } from "@/context/HnaPendingContext";
import { ReportsPendingProvider } from "@/context/ReportsPendingContext";
import { Layout } from "@/components/layout";
import { StaffLayout } from "@/components/staff-layout";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import Schedule from "@/pages/schedule";
import Reviews from "@/pages/reviews";
import Ads from "@/pages/ads";
import Events from "@/pages/events";
import Members from "@/pages/members";
import Vouchers from "@/pages/vouchers";
import Notifications from "@/pages/notifications";
import Pricing from "@/pages/pricing";
import StaffRevenue from "@/pages/staff/revenue";
import StaffBroadcast from "@/pages/staff/broadcast";
import StaffGeofence from "@/pages/staff/geofence";
import StaffEventsMembers from "@/pages/staff/events-members";
import StaffHnaReview from "@/pages/staff/hna-review";
import StaffModeration from "@/pages/staff/moderation";
import Payments from "@/pages/payments";
import CancellationPolicy from "@/pages/cancellation-policy";
import CancellationVouchers from "@/pages/cancellation-vouchers";

function Router() {
  const { club, staff, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (location === "/forgot-password") return <ForgotPassword />;
  if (staff) {
    return (
      <HnaPendingProvider>
        <ReportsPendingProvider>
          <StaffLayout>
            <Switch>
              <Route path="/" component={StaffRevenue} />
              <Route path="/broadcast" component={StaffBroadcast} />
              <Route path="/geofence" component={StaffGeofence} />
              <Route path="/events-members" component={StaffEventsMembers} />
              <Route path="/hna-review" component={StaffHnaReview} />
              <Route path="/moderation" component={StaffModeration} />
              <Route>
                <div className="p-8"><h1 className="text-2xl font-bold">Page not found</h1></div>
              </Route>
            </Switch>
          </StaffLayout>
        </ReportsPendingProvider>
      </HnaPendingProvider>
    );
  }
  if (!club) return <Login />;

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/profile" component={Profile} />
        <Route path="/tee-times" component={Schedule} />
        <Route path="/bookings" component={Schedule} />
        <Route path="/reviews" component={Reviews} />
        <Route path="/ads" component={Ads} />
        <Route path="/events" component={Events} />
        <Route path="/members" component={Members} />
        <Route path="/vouchers" component={Vouchers} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/payments" component={Payments} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/cancellation-policy" component={CancellationPolicy} />
        <Route path="/cancellation-vouchers" component={CancellationVouchers} />
        <Route>
          <div className="p-8">
            <h1 className="text-2xl font-bold">Page not found</h1>
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </AuthProvider>
    </TooltipProvider>
  );
}

export default App;
