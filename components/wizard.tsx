import { useRouter } from "next/router";
import React, { Fragment, ReactNode, useCallback, useRef } from "react";
import z, { AnyZodObject, ZodType } from "zod";
import { useZodForm } from "./useZodForm";
import { useSessionStorage } from "usehooks-ts";
import { useMemo } from "react";
import Link, { LinkProps } from "next/link";
import { useOnMount } from "./useOnMount";
import { createCtx, stringOrNull, omit, assertUnreachable } from "./utils";
import { useMountedOnClient } from "./useMountedOnClient";

const defaultStores = ["session"] as const;
type DefaultStore = (typeof defaultStores)[number];
export function createWizard<
  TStepTuple extends string[],
  TEndTuple extends string[],
  TSchemaRecord extends Partial<
    Record<TStepTuple[number] | TEndTuple[number], ZodType>
  >,
  TLinear extends boolean,
>(config: {
  id: string;
  /**
   * The steps in the wizard
   * Order matters - will be used to determine the order of the steps in the wizard when e.g. going back
   */
  steps: [...TStepTuple];
  end: [...TEndTuple];
  schema: TSchemaRecord;
  /**
   * Is it a Linear flow or does it have branches
   */
  linear: TLinear;
}) {
  // <Generics>
  type AssertZodType<T> = T extends ZodType ? T : never;

  type $EndStep = TEndTuple[number];

  type $Data = {
    [TStep in keyof TSchemaRecord]: AssertZodType<
      TSchemaRecord[TStep]
    >["_input"];
  };
  type $PartialData = {
    [TStep in keyof TSchemaRecord]?: Partial<$Data[TStep]>;
  };
  type $DataStep = keyof $Data;
  type $Step = TStepTuple[number] | $EndStep | $DataStep;
  type $EndStepWithData = $EndStep & $DataStep;

  interface $Store {
    data: $PartialData;
    patchData: $PatchDataFunction;
    onReachEndStep?: (step: $EndStepWithData) => void;
    onLeaveEndStep?: (step: $EndStepWithData) => void;
  }

  interface $StoredWizardState {
    history: $Step[];
    data: $PartialData;
  }

  //   <Generics:Functions>
  type $PatchDataFunction = (
    newData: Partial<$StoredWizardState["data"]>,
  ) => void | Promise<void>;

  type DataRequiredForStep<TStep extends $DataStep> = Record<
    TStep,
    $Data[TStep]
  > &
    Omit<NonNullable<$PartialData>, TStep>;
  interface $GoToStepFunction {
    (
      step: $EndStepWithData,
      data: DataRequiredForStep<$EndStepWithData>,
    ): Promise<void>;
    (
      step: Exclude<$Step, $EndStepWithData>,
      data?: $PartialData,
    ): Promise<void>;
  }
  interface $GoToStepFunctionUntyped {
    (step: $Step, data?: $PartialData): Promise<void>;
  }

  //   </Generics:Functions>
  // </Generics>

  // <Variables>
  const _def = {
    ...config,
    $types: null as null as unknown as {
      EndStep: $EndStep;
      AnyStep: $Step;
      Data: $Data;
      DataStep: $DataStep;
    },
    allSteps: [...config.steps, ...config.end] as $Step[],
    stepQueryKey: `w_${config.id}`,
  };
  // </Variables>

  function isEndStep(step: $Step): step is $EndStep {
    return _def.end.includes(step as any);
  }

  const [Provider, useContext] = createCtx<{
    start: $Step;
    currentStep: $Step;
    data: $PartialData;
    patchData: $PatchDataFunction;
    history: $Step[];
    push: $GoToStepFunction;
  }>();

  function patchDataFn(from: $PartialData, patch: $PartialData | undefined) {
    console.log(">>>>  patch >>>>>", { from, patch });
    if (!patch || !Object.keys(patch).length) {
      console.log("no patch");
      // no patch of the data, return original state
      return from;
    }
    const nextState: $PartialData = {
      ...from,
    };

    // patch each data entry individually
    for (const key in patch) {
      console.log("patching", key);
      nextState[key] = {
        ...from[key],
        ...patch[key],
      };
    }
    console.log("nextState", nextState);

    console.log("<<<<< patch end <<<<<<<");
    return nextState;
  }

  const sessionKey = (id: string, source: "data" | "history") =>
    `${_def.id}_${id}_${source}`;

  function useDefaultStore(props: {
    id: string;
    data?: $PartialData;
  }): Required<$Store> {
    const [innerData, setData] = useSessionStorage<$PartialData>(
      sessionKey(props.id, "data"),
      props.data ?? {},
    );
    const data: $PartialData = useMemo(() => {
      return patchDataFn(innerData, props.data);
    }, [innerData, props.data]);

    const patchData = React.useCallback(
      (newData: $PartialData) => {
        setData((state) => patchDataFn(state, newData));
      },
      [setData],
    );
    const onReachEndStep = React.useCallback(
      (step: $EndStepWithData) => {
        console.log("onReachEndStep", step);
        setData((data) => omit(data, _def.steps));
      },
      [setData],
    );
    const onLeaveEndStep = React.useCallback(
      (step: $EndStepWithData) => {
        console.log("onLeaveEndStep", step);
        setData((data) => omit(data, _def.end));
      },
      [setData],
    );
    return {
      data,
      patchData,
      onReachEndStep,
      onLeaveEndStep,
    };
  }

  function InnerWizard(props: {
    id: string;
    start: $Step;
    data?: $PartialData;
    steps: Record<$Step, React.ReactNode>;
    store?: $Store | DefaultStore;
    patchData?: $PatchDataFunction;
  }) {
    // step is controlled by the url
    const router = useRouter();

    const defaultStore = useDefaultStore(props);
    const store: $Store =
      props.store && typeof props.store !== "string"
        ? props.store
        : defaultStore;
    const [history, setHistory] = useSessionStorage<$Step[]>(
      sessionKey(props.id, "history"),
      [],
    );

    // console.log({state})
    /**
     * The current step is set by the url but we make sure we cannot navigate to a step if we don't have fulfilled the data requirements for it
     *
     **/
    const queryStep = stringOrNull(router.query[_def.stepQueryKey]);
    const requestedStep: $Step | null =
      queryStep && _def.allSteps.includes(queryStep) ? queryStep : null;

    const prevStep = React.useRef<$Step | null>(null);

    let currentStep: $Step = React.useMemo(() => {
      // check if requestedStep is a valid step
      if (!requestedStep || requestedStep === props.start) {
        // console.log("no requested step");
        return props.start;
      }

      console.log("requested step", requestedStep);
      const isEndStep = _def.end.includes(requestedStep as any);

      if (isEndStep) {
        // for end steps we validate the data
        const schema = _def.schema[requestedStep];
        if (schema && !schema.safeParse(store.data[requestedStep]).success) {
          return prevStep.current ?? props.start;
        }
        return requestedStep;
      }

      const requestedIdx = _def.allSteps.indexOf(requestedStep);
      console.log({ requestedIdx });
      if (
        _def.linear &&
        !_def.steps.every((step, index) => {
          // check all previous steps' data requirements are fulfilled
          if (index >= requestedIdx) {
            // skip current step and all next steps
            return true;
          }

          const schema = (_def.schema as Record<string, ZodType>)[step];
          return !schema || schema.safeParse(store.data[step]).success;
        })
      ) {
        console.log("not fulfilled step 2, going to start step", props.start);
        // if they arent' fulfilled, go to start step
        return props.start;
      }

      return requestedStep;
    }, [requestedStep, store.data, props.start]);
    console.log({
      requestedStep,
      stepQueryKey: _def.stepQueryKey,
      queryStep,
      currentStep,
      allSteps: _def.allSteps,
    });

    const queryForStep = React.useCallback(
      (step: $Step): typeof router.query => {
        return {
          ...omit(router.query, _def.stepQueryKey),
          ...(step === props.start ? {} : { [_def.stepQueryKey]: step }),
        };
      },
      [router.query],
    );

    const previousStep = React.useMemo((): $Step | null => {
      if (isEndStep(currentStep)) {
        return null;
      }
      const idx = _def.allSteps.indexOf(currentStep);

      const prev = _def.linear
        ? _def.steps[idx - 1]
        : [...history]
            .reverse()
            .find((step) => _def.allSteps.indexOf(step) < idx);

      return prev ?? null;
    }, [history, currentStep]);

    const goBackLink = React.useMemo((): LinkProps | null => {
      if (!previousStep) {
        return null;
      }
      return {
        href: {
          query: queryForStep(previousStep),
        },
        shallow: true,
        scroll: false,
      };
    }, [history, currentStep, router.query, previousStep]);

    const push = React.useCallback(async (step: $Step, data: $PartialData) => {
      console.log("push", step, data);
      if (data) {
        store.patchData(data);
      }

      if (isEndStep(step) && data) {
        // validate data
        const schema = _def.schema[step];
        if (!schema || !schema.safeParse(data[step]).success) {
          console.error(
            "Invalid data passed to end step - this shouldn't happen",
            data,
          );
          throw new Error("Invalid data passed to end step");
        }
      }
      console.log({
        query: queryForStep(step),
      });
      const pushed = await router.push(
        {
          query: queryForStep(step),
        },
        undefined,
        {
          // shallow: true,
          scroll: false,
        },
      );
      console.log({ pushed });
    }, []) as $GoToStepFunction;

    // update history when navigating
    React.useEffect(() => {
      console.log({ currentStep });
      setHistory((state) => {
        console.log("setting history");
        const lastHistory = state.at(-1);
        if (lastHistory === currentStep) {
          return state;
        }

        const history = currentStep === props.start ? [props.start] : state;
        return history;
      });
    }, [currentStep]);

    React.useEffect(() => {
      // ensure the url is always in sync with the current step
      if (!requestedStep || requestedStep === currentStep || !router.isReady) {
        return;
      }
      console.log("updating query params because of requestedStep mismatch", {
        requestedStep,
        currentStep,
      });

      void router.replace(
        {
          query: queryForStep(currentStep),
        },
        undefined,
        {
          shallow: true,
          scroll: false,
        },
      );
    }, [currentStep, router.isReady, requestedStep]);

    React.useEffect(() => {
      if (prevStep.current && isEndStep(currentStep)) {
        store.onReachEndStep?.(currentStep);
      } else if (
        prevStep.current &&
        isEndStep(prevStep.current) &&
        !isEndStep(currentStep)
      ) {
        store.onLeaveEndStep?.(prevStep.current);
      }
    }, [currentStep]);

    const transitionType =
      prevStep.current &&
      _def.allSteps.indexOf(prevStep.current) >
        _def.allSteps.indexOf(currentStep)
        ? "backward"
        : "forward";

    prevStep.current = currentStep;
    return (
      <Provider
        value={{
          push,
          start: props.start,
          currentStep,
          patchData: store.patchData,
          data: store.data,
          history,
        }}
      >
        {goBackLink && <Link {...goBackLink}>Go back</Link>}
        {Object.entries(props.steps).map(([step, children]) => (
          <Fragment key={step}>
            {currentStep === step ? (children as ReactNode) : null}
          </Fragment>
        ))}
      </Provider>
    );
  }

  function Wizard<TStart extends $Step>(
    props: {
      id: string;
      start: TStart;
      steps: Record<$Step, React.ReactNode>;
    } & (
      | {
          /**
           * Use a custom store instead of the default one which uses session storage
           */
          store: $Store;
        }
      | (TStart extends $EndStepWithData
          ? {
              store?: DefaultStore;
              data: DataRequiredForStep<TStart>;
            }
          : {
              store?: DefaultStore;
              data?: $PartialData;
            })
    ),
  ) {
    const router = useRouter();
    const mounted = useMountedOnClient();
    if (!mounted || !router.isReady) {
      // prevent flashes before the router is ready
      return null;
    }

    return <InnerWizard {...props} key={_def.id + props.id} />;
  }

  Wizard.displayName = `Wizard(${_def.id})`;
  Wizard.$types = _def.$types;

  Wizard.useForm = function useForm<
    TStep extends $DataStep & TStepTuple[number],
  >(
    step: TStep,
    opts?: {
      defaultValues?: $PartialData[TStep];
    },
  ) {
    const context = useContext();

    const schema = _def.schema[step];
    console.log("data", context.data);
    const form = useZodForm({
      schema: schema!,
      defaultValues: {
        ...opts?.defaultValues,
        ...context.data[step],
      },
    });
    const stateSaved = useRef(false);

    const saveState = React.useCallback(async () => {
      if (stateSaved.current) {
        return;
      }
      setTimeout(() => {
        stateSaved.current = false;
      }, 100);
      stateSaved.current = true;
      console.log("saving state", step, form.getValues());

      const data: $PartialData = {};
      data[step] = form.getValues();
      await context.patchData(data);
    }, []);

    useOnMount(() => {
      console.log("mount");
      // set draft data on unmount
      return () => {
        void saveState().catch(() => {
          // no-op
        });

        const data: $PartialData = {};
        data[step] = form.getValues();

        console.log("--------- setting draft data because of unmount", {
          step,
          data,
        });
      };
    });
    const handleSubmit = React.useCallback(
      async (values: $Data[TStep]) => {
        void saveState();
        console.log("submitting", values);

        await saveState();

        // go to next step
        if (_def.linear) {
          const nextStep = _def.steps[_def.steps.indexOf(step) + 1];
          console.log("next step", nextStep);
          if (nextStep) {
            const data: $PartialData = {};
            data[step] = values;
            await context.push(nextStep as Exclude<TStep, $EndStepWithData>);
          }
        }
      },
      [form],
    );

    return {
      form,
      handleSubmit,
      /**
       * When handling submit manually, call this function to save the state
       */
      saveState,
    };
  };

  Wizard.useContext = function useWizard() {
    const context = useContext();
    const router = useRouter();

    const data = context.data;
    const get = React.useCallback(
      <TStep extends $DataStep>(step: TStep): $Data[TStep] => {
        const schema = _def.schema[step];
        const result = schema!.safeParse(data[step]);
        if (!result.success) {
          console.error(
            "Invalid data for step",
            step,
            data[step],
            result.error,
          );
          throw new Error("Invalid data for step");
        }
        return data[step] as $Data[TStep];
      },
      [data],
    );

    return {
      push: context.push,
      patchData: context.patchData,
      get,
    };
  };

  return Wizard;
}
