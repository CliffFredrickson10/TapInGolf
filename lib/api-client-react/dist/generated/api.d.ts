import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { ClubProfile, ClubProfileInput, DashboardStats, GenerateTeeSheetInput, GetPortalTeeSheetParams, HealthStatus, SlotBooking, SlotBookingInput, TeeSheetDay, TeeSlot, TeeSlotUpdate } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetPortalDashboardUrl: () => string;
/**
 * @summary Dashboard statistics
 */
export declare const getPortalDashboard: (options?: RequestInit) => Promise<DashboardStats>;
export declare const getGetPortalDashboardQueryKey: () => readonly ["/api/portal/dashboard"];
export declare const getGetPortalDashboardQueryOptions: <TData = Awaited<ReturnType<typeof getPortalDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPortalDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPortalDashboard>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPortalDashboardQueryResult = NonNullable<Awaited<ReturnType<typeof getPortalDashboard>>>;
export type GetPortalDashboardQueryError = ErrorType<unknown>;
/**
 * @summary Dashboard statistics
 */
export declare function useGetPortalDashboard<TData = Awaited<ReturnType<typeof getPortalDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPortalDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListPortalClubsUrl: () => string;
/**
 * @summary List all club profiles
 */
export declare const listPortalClubs: (options?: RequestInit) => Promise<ClubProfile[]>;
export declare const getListPortalClubsQueryKey: () => readonly ["/api/portal/clubs"];
export declare const getListPortalClubsQueryOptions: <TData = Awaited<ReturnType<typeof listPortalClubs>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPortalClubs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPortalClubs>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListPortalClubsQueryResult = NonNullable<Awaited<ReturnType<typeof listPortalClubs>>>;
export type ListPortalClubsQueryError = ErrorType<unknown>;
/**
 * @summary List all club profiles
 */
export declare function useListPortalClubs<TData = Awaited<ReturnType<typeof listPortalClubs>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPortalClubs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreatePortalClubUrl: () => string;
/**
 * @summary Create a club profile
 */
export declare const createPortalClub: (clubProfileInput: ClubProfileInput, options?: RequestInit) => Promise<ClubProfile>;
export declare const getCreatePortalClubMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPortalClub>>, TError, {
        data: BodyType<ClubProfileInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createPortalClub>>, TError, {
    data: BodyType<ClubProfileInput>;
}, TContext>;
export type CreatePortalClubMutationResult = NonNullable<Awaited<ReturnType<typeof createPortalClub>>>;
export type CreatePortalClubMutationBody = BodyType<ClubProfileInput>;
export type CreatePortalClubMutationError = ErrorType<unknown>;
/**
* @summary Create a club profile
*/
export declare const useCreatePortalClub: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPortalClub>>, TError, {
        data: BodyType<ClubProfileInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createPortalClub>>, TError, {
    data: BodyType<ClubProfileInput>;
}, TContext>;
export declare const getGetPortalClubUrl: (clubId: number) => string;
/**
 * @summary Get club profile
 */
export declare const getPortalClub: (clubId: number, options?: RequestInit) => Promise<ClubProfile>;
export declare const getGetPortalClubQueryKey: (clubId: number) => readonly [`/api/portal/clubs/${number}`];
export declare const getGetPortalClubQueryOptions: <TData = Awaited<ReturnType<typeof getPortalClub>>, TError = ErrorType<void>>(clubId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPortalClub>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPortalClub>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPortalClubQueryResult = NonNullable<Awaited<ReturnType<typeof getPortalClub>>>;
export type GetPortalClubQueryError = ErrorType<void>;
/**
 * @summary Get club profile
 */
export declare function useGetPortalClub<TData = Awaited<ReturnType<typeof getPortalClub>>, TError = ErrorType<void>>(clubId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPortalClub>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdatePortalClubUrl: (clubId: number) => string;
/**
 * @summary Update club profile
 */
export declare const updatePortalClub: (clubId: number, clubProfileInput: ClubProfileInput, options?: RequestInit) => Promise<ClubProfile>;
export declare const getUpdatePortalClubMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePortalClub>>, TError, {
        clubId: number;
        data: BodyType<ClubProfileInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updatePortalClub>>, TError, {
    clubId: number;
    data: BodyType<ClubProfileInput>;
}, TContext>;
export type UpdatePortalClubMutationResult = NonNullable<Awaited<ReturnType<typeof updatePortalClub>>>;
export type UpdatePortalClubMutationBody = BodyType<ClubProfileInput>;
export type UpdatePortalClubMutationError = ErrorType<unknown>;
/**
* @summary Update club profile
*/
export declare const useUpdatePortalClub: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePortalClub>>, TError, {
        clubId: number;
        data: BodyType<ClubProfileInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updatePortalClub>>, TError, {
    clubId: number;
    data: BodyType<ClubProfileInput>;
}, TContext>;
export declare const getGetPortalTeeSheetUrl: (params: GetPortalTeeSheetParams) => string;
/**
 * @summary Get tee sheet for a specific club and date
 */
export declare const getPortalTeeSheet: (params: GetPortalTeeSheetParams, options?: RequestInit) => Promise<TeeSheetDay>;
export declare const getGetPortalTeeSheetQueryKey: (params?: GetPortalTeeSheetParams) => readonly ["/api/portal/tee-sheet", ...GetPortalTeeSheetParams[]];
export declare const getGetPortalTeeSheetQueryOptions: <TData = Awaited<ReturnType<typeof getPortalTeeSheet>>, TError = ErrorType<unknown>>(params: GetPortalTeeSheetParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPortalTeeSheet>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPortalTeeSheet>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPortalTeeSheetQueryResult = NonNullable<Awaited<ReturnType<typeof getPortalTeeSheet>>>;
export type GetPortalTeeSheetQueryError = ErrorType<unknown>;
/**
 * @summary Get tee sheet for a specific club and date
 */
export declare function useGetPortalTeeSheet<TData = Awaited<ReturnType<typeof getPortalTeeSheet>>, TError = ErrorType<unknown>>(params: GetPortalTeeSheetParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPortalTeeSheet>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGeneratePortalTeeSheetUrl: () => string;
/**
 * @summary Auto-generate tee slots for a date based on club configuration
 */
export declare const generatePortalTeeSheet: (generateTeeSheetInput: GenerateTeeSheetInput, options?: RequestInit) => Promise<TeeSheetDay>;
export declare const getGeneratePortalTeeSheetMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof generatePortalTeeSheet>>, TError, {
        data: BodyType<GenerateTeeSheetInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof generatePortalTeeSheet>>, TError, {
    data: BodyType<GenerateTeeSheetInput>;
}, TContext>;
export type GeneratePortalTeeSheetMutationResult = NonNullable<Awaited<ReturnType<typeof generatePortalTeeSheet>>>;
export type GeneratePortalTeeSheetMutationBody = BodyType<GenerateTeeSheetInput>;
export type GeneratePortalTeeSheetMutationError = ErrorType<unknown>;
/**
* @summary Auto-generate tee slots for a date based on club configuration
*/
export declare const useGeneratePortalTeeSheet: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof generatePortalTeeSheet>>, TError, {
        data: BodyType<GenerateTeeSheetInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof generatePortalTeeSheet>>, TError, {
    data: BodyType<GenerateTeeSheetInput>;
}, TContext>;
export declare const getUpdateTeeSlotUrl: (slotId: number) => string;
/**
 * @summary Update a tee slot (active status, notes, rate codes)
 */
export declare const updateTeeSlot: (slotId: number, teeSlotUpdate: TeeSlotUpdate, options?: RequestInit) => Promise<TeeSlot>;
export declare const getUpdateTeeSlotMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTeeSlot>>, TError, {
        slotId: number;
        data: BodyType<TeeSlotUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTeeSlot>>, TError, {
    slotId: number;
    data: BodyType<TeeSlotUpdate>;
}, TContext>;
export type UpdateTeeSlotMutationResult = NonNullable<Awaited<ReturnType<typeof updateTeeSlot>>>;
export type UpdateTeeSlotMutationBody = BodyType<TeeSlotUpdate>;
export type UpdateTeeSlotMutationError = ErrorType<void>;
/**
* @summary Update a tee slot (active status, notes, rate codes)
*/
export declare const useUpdateTeeSlot: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTeeSlot>>, TError, {
        slotId: number;
        data: BodyType<TeeSlotUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTeeSlot>>, TError, {
    slotId: number;
    data: BodyType<TeeSlotUpdate>;
}, TContext>;
export declare const getListSlotBookingsUrl: (slotId: number) => string;
/**
 * @summary List all bookings for a tee slot
 */
export declare const listSlotBookings: (slotId: number, options?: RequestInit) => Promise<SlotBooking[]>;
export declare const getListSlotBookingsQueryKey: (slotId: number) => readonly [`/api/portal/slots/${number}/bookings`];
export declare const getListSlotBookingsQueryOptions: <TData = Awaited<ReturnType<typeof listSlotBookings>>, TError = ErrorType<void>>(slotId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listSlotBookings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listSlotBookings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListSlotBookingsQueryResult = NonNullable<Awaited<ReturnType<typeof listSlotBookings>>>;
export type ListSlotBookingsQueryError = ErrorType<void>;
/**
 * @summary List all bookings for a tee slot
 */
export declare function useListSlotBookings<TData = Awaited<ReturnType<typeof listSlotBookings>>, TError = ErrorType<void>>(slotId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listSlotBookings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCancelSlotBookingUrl: (slotId: number, bookingId: number) => string;
/**
 * @summary Cancel (delete) a booking from a slot
 */
export declare const cancelSlotBooking: (slotId: number, bookingId: number, options?: RequestInit) => Promise<TeeSlot>;
export declare const getCancelSlotBookingMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof cancelSlotBooking>>, TError, {
        slotId: number;
        bookingId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof cancelSlotBooking>>, TError, {
    slotId: number;
    bookingId: number;
}, TContext>;
export type CancelSlotBookingMutationResult = NonNullable<Awaited<ReturnType<typeof cancelSlotBooking>>>;
export type CancelSlotBookingMutationError = ErrorType<void>;
/**
* @summary Cancel (delete) a booking from a slot
*/
export declare const useCancelSlotBooking: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof cancelSlotBooking>>, TError, {
        slotId: number;
        bookingId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof cancelSlotBooking>>, TError, {
    slotId: number;
    bookingId: number;
}, TContext>;
export declare const getBookTeeSlotUrl: (slotId: number) => string;
/**
 * @summary Add a player booking to a slot
 */
export declare const bookTeeSlot: (slotId: number, slotBookingInput: SlotBookingInput, options?: RequestInit) => Promise<TeeSlot>;
export declare const getBookTeeSlotMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bookTeeSlot>>, TError, {
        slotId: number;
        data: BodyType<SlotBookingInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof bookTeeSlot>>, TError, {
    slotId: number;
    data: BodyType<SlotBookingInput>;
}, TContext>;
export type BookTeeSlotMutationResult = NonNullable<Awaited<ReturnType<typeof bookTeeSlot>>>;
export type BookTeeSlotMutationBody = BodyType<SlotBookingInput>;
export type BookTeeSlotMutationError = ErrorType<void>;
/**
* @summary Add a player booking to a slot
*/
export declare const useBookTeeSlot: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bookTeeSlot>>, TError, {
        slotId: number;
        data: BodyType<SlotBookingInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof bookTeeSlot>>, TError, {
    slotId: number;
    data: BodyType<SlotBookingInput>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map