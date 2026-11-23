import type { PortalForm, PortalProblem } from '@wagonwise/contracts/usage';
import { useEffect, useMemo } from 'react';
import { problemFromTag } from '../lib/portal-tracker';
import { getPortalTracker } from './use-portal-tracking';

/**
 * Tells the portal's tracking how one of its forms is used (docs/company-account-states-scope.md, "Portal tracking"): when something is
 * first typed in it, when it is sent, which field showed what kind of problem, and when it is left part-way. Only names from fixed lists:
 * the form, the field and a kind of problem, never what was typed. Put `touched` on the form's `onChange`.
 */
export function useFormTracking(form: PortalForm) {
  const track = useMemo(
    () => ({
      /** Something was typed or chosen. Counts the form as opened the first time. */
      touched: () => getPortalTracker().formTouched(form),
      sent: () => getPortalTracker().formSent(form),
      /** The form showed these problems and was not sent. */
      problems: (list: readonly { field: string; problem: PortalProblem }[]) => {
        for (const { field, problem } of list) getPortalTracker().formProblem(form, field, problem);
      },
      /** The server refused the form. Only the error's tag is looked at, never its message. */
      failed: (error: unknown) => {
        const tag =
          typeof error === 'object' &&
          error !== null &&
          'tag' in error &&
          typeof error.tag === 'string'
            ? error.tag
            : undefined;
        getPortalTracker().formProblem(form, 'form', problemFromTag(tag));
      },
    }),
    [form],
  );

  // Leaving the page with the form started and not sent is a form left part-way.
  useEffect(() => () => getPortalTracker().formLeft(form), [form]);

  return track;
}
