import { z } from 'zod';
import { uuidSchema } from './common';

export const universalApplicationSchema = z.object({
  household: z.object({
    adults: z.number().int().min(1).max(20).optional(),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(10).optional(),
    allAgreed: z.boolean().optional(),
    primaryCaregiver: z.string().max(200).optional(),
    allergies: z.string().max(500).optional(),
  }).optional(),
  residence: z.object({
    type: z.enum(['house', 'apartment', 'condo', 'townhouse', 'mobile', 'other']).optional(),
    ownOrRent: z.enum(['own', 'rent']).optional(),
    yard: z.boolean().optional(),
    fenceType: z.string().max(120).optional(),
    hoursAlonePerDay: z.number().int().min(0).max(24).optional(),
    petLocation: z.enum(['indoors', 'outdoors', 'both']).optional(),
  }).optional(),
  landlord: z.object({
    name: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
    propertyName: z.string().max(200).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(2).optional(),
    petPolicyKnown: z.boolean().optional(),
    petDeposit: z.number().optional(),
    monthlyPetRent: z.number().optional(),
    breedRestrictions: z.string().max(300).optional(),
    weightLimit: z.number().optional(),
    approvalConfirmed: z.boolean().optional(),
  }).optional(),
  currentPets: z.array(z.object({
    species: z.enum(['dog', 'cat', 'other']),
    age: z.string().max(30),
    spayed: z.boolean().optional(),
    getsAlongWith: z.string().max(300).optional(),
  })).max(8).optional(),
  petHistory: z.object({
    hadPetsBefore: z.boolean().optional(),
    previousPetsDesc: z.string().max(600).optional(),
    everSurrendered: z.boolean().optional(),
    surrenderReason: z.string().max(400).optional(),
  }).optional(),
  lifestyle: z.object({
    exercisePlan: z.string().max(400).optional(),
    trainingPlan: z.string().max(400).optional(),
    behaviorPlan: z.string().max(400).optional(),
    transportPlan: z.string().max(200).optional(),
    careIfUnable: z.string().max(300).optional(),
  }).optional(),
  preferences: z.object({
    sexPreference: z.enum(['male', 'female', 'no_preference']).optional(),
    sizePreference: z.enum(['small', 'medium', 'large', 'xl', 'no_preference']).optional(),
    ageRange: z.string().max(60).optional(),
    traitsWanted: z.string().max(300).optional(),
  }).optional(),
  vetCare: z.object({
    currentVet: z.string().max(200).optional(),
    financialReady: z.boolean().optional(),
    insuranceConsidered: z.boolean().optional(),
  }).optional(),
});
export type UniversalApplication = z.infer<typeof universalApplicationSchema>;

export const rentalPetPolicySchema = z.object({
  allowed: z.boolean(),
  maxPets: z.number().optional(),
  deposit: z.number().optional(),
  monthlyRent: z.number().optional(),
  notes: z.string().max(300).optional(),
});
export type RentalPetPolicy = z.infer<typeof rentalPetPolicySchema>;

export const rentalPropertySchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  city: z.string(),
  state: z.string(),
  petPolicy: rentalPetPolicySchema,
  confirmedCount: z.number().int(),
});
export type RentalPropertyPublic = z.infer<typeof rentalPropertySchema>;

export const searchRentalSchema = z.object({
  q: z.string().min(2).max(200),
  city: z.string().max(120).optional(),
});
export type SearchRentalQuery = z.infer<typeof searchRentalSchema>;

export const saveRentalPropertySchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  city: z.string().min(0).max(120).default(''),
  state: z.string().min(0).max(2).default(''),
  petPolicy: rentalPetPolicySchema,
});
export type SaveRentalPropertyInput = z.infer<typeof saveRentalPropertySchema>;
