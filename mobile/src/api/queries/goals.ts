import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Goal = S['Goal'];
export type GoalSummary = S['GoalSummary'];
export type GoalInput = S['GoalInput'];
export type GoalUpdate = S['GoalUpdate'];
export type GoalStep = S['GoalStep'];

/** Хамтын зорилго (FR-9.3, 9.4) — гэрээ `Goals`. Key: `['goals']`, `['goal', id]` (`goal.updated` — AC-42). */
export const GOALS_KEY = ['goals'] as const;
export const goalKey = (id: string) => ['goal', id] as const;
export const GOAL_TITLE_MAX = 120;
export const GOAL_MAX_STEPS = 50;

export function useGoals() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: GOALS_KEY, queryFn: () => unwrap(api.GET('/goals')), enabled: !!accessToken });
}

export function useGoal(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: goalKey(id ?? ''),
    queryFn: () => unwrap(api.GET('/goals/{goalId}', { params: { path: { goalId: id ?? '' } } })),
    enabled: !!accessToken && !!id,
  });
}

export function createGoal(body: GoalInput): Promise<Goal> {
  return unwrap(api.POST('/goals', { body }));
}

export function updateGoal(id: string, body: GoalUpdate): Promise<Goal> {
  return unwrap(api.PATCH('/goals/{goalId}', { params: { path: { goalId: id } }, body }));
}

export async function deleteGoal(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/goals/{goalId}', { params: { path: { goalId: id } } }));
}

export function addGoalStep(goalId: string, title: string): Promise<Goal> {
  return unwrap(api.POST('/goals/{goalId}/steps', { params: { path: { goalId } }, body: { title } }));
}

export function setGoalStepDone(stepId: string, done: boolean): Promise<Goal> {
  return unwrap(api.PATCH('/goal-steps/{stepId}', { params: { path: { stepId } }, body: { done } }));
}

export async function deleteGoalStep(stepId: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/goal-steps/{stepId}', { params: { path: { stepId } } }));
}

export function addContribution(goalId: string, amountMnt: number): Promise<Goal> {
  return unwrap(api.POST('/goals/{goalId}/contributions', { params: { path: { goalId } }, body: { amountMnt } }));
}

export async function deleteContribution(contributionId: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/goal-contributions/{contributionId}', { params: { path: { contributionId } } }));
}

export function invalidateGoals(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: GOALS_KEY }),
    client.invalidateQueries({ queryKey: ['goal'] }),
  ]).then(() => undefined);
}

async function unwrapEmpty(p: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await p;
  if (!response.ok) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
}
