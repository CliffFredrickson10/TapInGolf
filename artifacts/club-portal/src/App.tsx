import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { HnaPendingProvider } from "@/context/HnaPendingContext";
import { ReportsPendingProvider } from "@/context/ReportsPendingContext";
import { ReviewReportsPendingProvider } from "@/context/ReviewReportsPendingContext";
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
import StaffReviewModeration from "@/pages/staff/review-moderation";
import StaffUsers from "@/pages/staff/users";
import StaffClubs from "@/pages/staff/clubs";
import StaffAds from "@/pages/staff/ads";
import StaffVouchers from "@/pages/staff/vouchers";
import StaffReminderSettings from "@/pages/staff/reminder-settings";
import Payments from "@/pages/payments";
import CancellationPolicy from "@/pages/cancellation-policy";
import PortalUsers from "@/pages/portal-users";

function SectionGuard({ section, children }: { section: string; children: React.ReactNode }) {
  const { canView } = useAuth();
  if (!canView(section)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground font-medium">You don't have access to this section.</p>
          <p className="text-xs text-muted-foreground mt-1">Contact your club admin to request access.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

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
          <ReviewReportsPendingProvider>
            <StaffLayout>
              <Switch>
                <Route path="/" component={StaffRevenue} />
                <Route path="/broadcast" component={StaffBroadcast} />
                <Route path="/geofence" component={StaffGeofence} />
                <Route path="/events-members" component={StaffEventsMembers} />
                <Route path="/hna-review" component={StaffHnaReview} />
                <Route path="/moderation" component={StaffModeration} />
                <Route path="/review-reports" component={StaffReviewModeration} />
                <Route path="/users" component={StaffUsers} />
                <Route path="/clubs" component={StaffClubs} />
                <Route path="/ads" component={StaffAds} />
                <Route path="/vouchers" component={StaffVouchers} />
                <Route path="/reminder-settings" component={StaffReminderSettings} />
                <Route>
                  <div className="p-8"><h1 className="text-2xl font-bold">Page not found</h1></div>
                </Route>
              </Switch>
            </StaffLayout>
          </ReviewReportsPendingProvider>
        </ReportsPendingProvider>
      </HnaPendingProvider>
    );
  }
  if (!club) return <Login />;

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/profile">
          <SectionGuard section="profile"><Profile /></SectionGuard>
        </Route>
        <Route path="/tee-times">
          <SectionGuard section="schedule"><Schedule /></SectionGuard>
        </Route>
        <Route path="/bookings">
          <SectionGuard section="schedule"><Schedule /></SectionGuard>
        </Route>
        <Route path="/reviews">
          <SectionGuard section="reviews"><Reviews /></SectionGuard>
        </Route>
        <Route path="/ads">
          <SectionGuard section="ads"><Ads /></SectionGuard>
        </Route>
        <Route path="/events">
          <SectionGuard section="events"><Events /></SectionGuard>
        </Route>
        <Route path="/members">
          <SectionGuard section="members"><Members /></SectionGuard>
        </Route>
        <Route path="/vouchers">
          <SectionGuard section="vouchers"><Vouchers /></SectionGuard>
        </Route>
        <Route path="/pricing">
          <SectionGuard section="pricing"><Pricing /></SectionGuard>
        </Route>
        <Route path="/payments">
          <SectionGuard section="payments"><Payments /></SectionGuard>
        </Route>
        <Route path="/notifications">
          <SectionGuard section="notifications"><Notifications /></SectionGuard>
        </Route>
        <Route path="/cancellation-policy">
          <SectionGuard section="cancellation_policy"><CancellationPolicy /></SectionGuard>
        </Route>
        <Route path="/portal-users" component={PortalUsers} />
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
