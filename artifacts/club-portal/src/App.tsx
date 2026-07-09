import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ReadOnlyProvider, ReadOnlyBanner } from "@/context/ReadOnlyContext";
import { HnaPendingProvider } from "@/context/HnaPendingContext";
import { ReportsPendingProvider } from "@/context/ReportsPendingContext";
import { ReviewReportsPendingProvider } from "@/context/ReviewReportsPendingContext";
import { Layout } from "@/components/layout";
import { StaffLayout } from "@/components/staff-layout";
import { ResellerLayout } from "@/components/reseller-layout";
import { PosLayout } from "@/components/pos-layout";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import Schedule from "@/pages/schedule";
import StandingTeeTimes from "@/pages/standing-tee-times";
import Reviews from "@/pages/reviews";
import Ads from "@/pages/ads";
import Events from "@/pages/events";
import Members from "@/pages/members";
import Bans from "@/pages/bans";
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
import StaffGuestLeads from "@/pages/staff/guest-leads";
import StaffResellers from "@/pages/staff/resellers";
import Resale from "@/pages/resale";
import ResellerSearch from "@/pages/reseller/search";
import ResellerClub from "@/pages/reseller/club";
import ResellerPurchases from "@/pages/reseller/purchases";
import ResaleSuccess from "@/pages/reseller/resale-success";
import Payments from "@/pages/payments";
import Invoices from "@/pages/invoices";
import CancellationPolicy from "@/pages/cancellation-policy";
import Bookings from "@/pages/bookings";
import { Redirect } from "wouter";
import PortalUsers from "@/pages/portal-users";
import Scorecard from "@/pages/scorecard";
import RulesFormats from "@/pages/rules-formats";
import Outlets from "@/pages/outlets";
import PosTill from "@/pages/pos/till";
import PosTables from "@/pages/pos/tables";
import PosOverview from "@/pages/pos/overview";
import PosOrder from "@/pages/pos/order";
import PosProducts from "@/pages/pos/products";
import PosSuppliers from "@/pages/pos/suppliers";
import PosStockOrders from "@/pages/pos/stock-orders";
import PosPromotions from "@/pages/pos/promotions";
import PosStaffPage from "@/pages/pos/staff";
import PosTransactions from "@/pages/pos/transactions";
import PosReports from "@/pages/pos/reports";

function SectionGuard({ section, children }: { section: string; children: React.ReactNode }) {
  const { canView, canEdit } = useAuth();
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
  const readOnly = !canEdit(section);
  return (
    <ReadOnlyProvider readOnly={readOnly}>
      <ReadOnlyBanner />
      {children}
    </ReadOnlyProvider>
  );
}

// Bar/restaurant home: waiters get the working Tables & Orders screen; a
// manager who unlocks the terminal gets the read-focused floor overview.
function PosHome() {
  const { activeWaiter } = useAuth();
  return activeWaiter?.role === "manager" ? <PosOverview /> : <PosTables />;
}

function Router() {
  const { club, staff, reseller, posStaff, posOutlet, loading } = useAuth();
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
                <Route path="/guest-leads" component={StaffGuestLeads} />
                <Route path="/resellers" component={StaffResellers} />
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
  if (posStaff) {
    const isManager = posStaff.role === "manager";
    const isProShop = posOutlet?.type === "pro_shop";
    return (
      <PosLayout>
        <Switch>
          <Route path="/" component={isProShop ? PosTill : PosHome} />
          <Route path="/orders/:id" component={PosOrder} />
          {isManager && <Route path="/products" component={PosProducts} />}
          {isManager && <Route path="/suppliers" component={PosSuppliers} />}
          {isManager && <Route path="/stock-orders" component={PosStockOrders} />}
          {isManager && <Route path="/promotions" component={PosPromotions} />}
          {isManager && <Route path="/staff" component={PosStaffPage} />}
          {isManager && <Route path="/transactions" component={PosTransactions} />}
          {isManager && <Route path="/reports" component={PosReports} />}
          <Route>
            <div className="p-8"><h1 className="text-2xl font-bold">Page not found</h1></div>
          </Route>
        </Switch>
      </PosLayout>
    );
  }
  if (reseller) {
    return (
      <ResellerLayout>
        <Switch>
          <Route path="/" component={ResellerSearch} />
          <Route path="/clubs/:id" component={ResellerClub} />
          <Route path="/purchases" component={ResellerPurchases} />
          <Route path="/resale-success" component={ResaleSuccess} />
          <Route>
            <div className="p-8"><h1 className="text-2xl font-bold">Page not found</h1></div>
          </Route>
        </Switch>
      </ResellerLayout>
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
        <Route path="/standing-tee-times">
          <SectionGuard section="schedule"><StandingTeeTimes /></SectionGuard>
        </Route>
        <Route path="/bookings">
          <SectionGuard section="schedule"><Bookings /></SectionGuard>
        </Route>
        <Route path="/resale">
          <SectionGuard section="schedule"><Resale /></SectionGuard>
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
        <Route path="/bans">
          <SectionGuard section="bans"><Bans /></SectionGuard>
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
        <Route path="/invoices">
          <SectionGuard section="members"><Invoices /></SectionGuard>
        </Route>
        <Route path="/notifications">
          <SectionGuard section="notifications"><Notifications /></SectionGuard>
        </Route>
        <Route path="/scorecard">
          <SectionGuard section="scorecard"><Scorecard /></SectionGuard>
        </Route>
        <Route path="/rules-formats" component={RulesFormats} />
        <Route path="/cancellation-policy">
          <SectionGuard section="cancellation_policy"><CancellationPolicy /></SectionGuard>
        </Route>
        <Route path="/cancelled-bookings">
          <Redirect to="/bookings" />
        </Route>
        <Route path="/portal-users" component={PortalUsers} />
        <Route path="/outlets" component={Outlets} />
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
