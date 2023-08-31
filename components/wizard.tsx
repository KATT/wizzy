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

type StorageType = "sessionStorage" | "custom";

let logEnabled = false;

const logger = (wizardId: string, instanceId: string) => {
  return (...args: any[]) => {
    if (logEnabled) {
      console.log(`[${wizardId}:${instanceId}]`, ...args);
    }
  };
};

type Logger = ReturnType<typeof logger>;

export function createWizard<
  TStepTuple extends string[],
  TEndTuple extends string[],
  TSchemaRecord extends Partial<
    Record<TStepTuple[number] | TEndTuple[number], ZodType>
  >,
  TLinear extends boolean,
  TStorage extends StorageType,
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
  /**
   * Where the draft state of the wizard is stored
   * If you define your own storage, you need to provide the storage object in the Wizard props
   * @default 'sessionStorage'
   */
  storage?: TStorage;
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
  type $DataStep = string & keyof $Data;
  type $Step = string & (TStepTuple[number] | $EndStep | $DataStep);
  type $EndStepWithData = $EndStep & $DataStep;

  interface $StorageShape {
    data: $PartialData;
    patchData: $PatchDataFunction;
    onReachEndStep?: (step: $EndStepWithData) => void;
    onLeaveEndStep?: (step: $EndStepWithData) => void;
  }

  interface $StoragedWizardState {
    history: $Step[];
    data: $PartialData;
  }

  //   <Generics:Functions>
  type $PatchDataFunction = (
    newData: Partial<$StoragedWizardState["data"]>,
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
    storage: (config.storage ?? "sessionStorage") as TStorage,
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
    log: Logger;
  }>();

  function patchDataFn(from: $PartialData, patch: $PartialData | undefined) {
    if (!patch || !Object.keys(patch).length) {
      // no patch of the data, return original state
      return from;
    }
    const nextState: $PartialData = {
      ...from,
    };

    // patch each data entry individually
    for (const key in patch) {
      nextState[key] = {
        ...from[key],
        ...patch[key],
      };
    }

    return nextState;
  }

  const sessionKey = (id: string, source: "data" | "history") =>
    `${_def.id}_${id}_${source}`;

  function useDefaultStorage(props: {
    id: string;
    data?: $PartialData;
    log: Logger;
  }): Required<$StorageShape> {
    const { log } = props;
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
        log("onReachEndStep - resetting state from other steps", step);
        setData((data) => omit(data, _def.steps));
      },
      [setData],
    );
    const onLeaveEndStep = React.useCallback(
      (step: $EndStepWithData) => {
        log("onLeaveEndStep - resetting end steps' state", step);
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

  function useStorage(props: {
    id: string;
    log: Logger;
    storage?: $StorageShape;
    data?: $PartialData;
  }): $StorageShape {
    // using a conditional hook is okay here because the storage is set in the factory function
    switch (_def.storage) {
      case "sessionStorage":
        return useDefaultStorage(props);
      case "custom":
        return props.storage!;
    }

    assertUnreachable(_def.storage);
  }

  function InnerWizard(props: {
    id: string;
    start: $Step;
    data?: $PartialData;
    steps: Record<$Step, React.ReactNode>;
    storage?: $StorageShape;
    patchData?: $PatchDataFunction;
    log: Logger;
  }) {
    const { log } = props;
    // step is controlled by the url
    const router = useRouter();

    const storage = useStorage(props);
    const [history, setHistory] = useSessionStorage<$Step[]>(
      sessionKey(props.id, "history"),
      [],
    );

    // log({state})
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
        // log("no requested step");
        return props.start;
      }

      log("requested step", requestedStep);
      const isEndStep = _def.end.includes(requestedStep as any);

      if (isEndStep) {
        // for end steps we validate the data
        const schema = _def.schema[requestedStep];
        if (schema && !schema.safeParse(storage.data[requestedStep]).success) {
          return prevStep.current ?? props.start;
        }
        return requestedStep;
      }

      const requestedIdx = _def.allSteps.indexOf(requestedStep);

      if (
        _def.linear &&
        !_def.steps.every((step, index) => {
          // check all previous steps' data requirements are fulfilled
          if (index >= requestedIdx) {
            // skip current step and all next steps
            return true;
          }

          const schema = (_def.schema as Record<string, ZodType>)[step];
          if (!schema) {
            return true;
          }
          const ok = schema.safeParse(storage.data[step]).success;
          if (!ok) {
            log(
              `not fulfilled previous step ${step}, returning to strart step "${props.start}"`,
            );
            return false;
          }
          return true;
        })
      ) {
        // if they arent' fulfilled, go to start step
        return props.start;
      }

      return requestedStep;
    }, [requestedStep, storage.data, props.start]);
    log({
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
      log("push", step, data);
      if (data) {
        storage.patchData(data);
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
      log({
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

      if (isEndStep(step)) {
        storage.onReachEndStep?.(step);
      }
    }, []) as $GoToStepFunction;

    // update history when navigating
    React.useEffect(() => {
      log({ currentStep });
      setHistory((state) => {
        log("setting history");
        const lastHistory = state.at(-1);
        if (lastHistory === currentStep) {
          return state;
        }
        if ((currentStep === props.start) === isEndStep(currentStep)) {
          log("resetting history", {
            currentStep,
            isEndStep: isEndStep(currentStep),
          });
          return [];
        }

        const history =
          (currentStep === props.start) === isEndStep(currentStep) ? [] : state;
        return history;
      });
    }, [currentStep]);

    React.useEffect(() => {
      // ensure the url is always in sync with the current step
      if (!requestedStep || requestedStep === currentStep || !router.isReady) {
        return;
      }
      log("updating query params because of requestedStep mismatch", {
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
      if (
        prevStep.current &&
        isEndStep(prevStep.current) &&
        !isEndStep(currentStep)
      ) {
        storage.onLeaveEndStep?.(prevStep.current);
      }
    }, [currentStep]);

    useOnMount(() => {
      // reset wizard query params when unmounting
      return () => {
        if (!router.query[_def.stepQueryKey]) {
          return;
        }
        void router.replace(
          {
            query: queryForStep(props.start),
          },
          undefined,
          {
            shallow: true,
            scroll: false,
          },
        );
      };
    });

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
          patchData: storage.patchData,
          data: storage.data,
          history,
          log,
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
    } & (TStorage extends "custom"
      ? {
          storage: $StorageShape;
        }
      : TStart extends $EndStepWithData
      ? {
          data: DataRequiredForStep<TStart>;
        }
      : {
          data?: $PartialData;
        }),
  ) {
    const router = useRouter();
    const mounted = useMountedOnClient();
    const log = logger(_def.id, props.id);
    logEnabled =
      process.env.NODE_ENV === "development" || "debug" in router.query;

    if (!mounted || !router.isReady) {
      // prevent flashes before the router is ready
      return null;
    }

    return <InnerWizard {...props} log={log} key={_def.id + props.id} />;
  }

  Wizard.displayName = `Wizard(${_def.id})`;
  Wizard.$types = _def.$types;

  Wizard.useForm = function useForm<
    TStep extends $DataStep & TStepTuple[number],
  >(
    step: TStep,
    opts?: {
      defaultValues?: $PartialData[TStep];
      /**
       * Called when the form is submitted
       */
      handleSubmit?: (values: $Data[TStep]) => Promise<void>;
      nextStep?: Exclude<$Step, $EndStepWithData>;
    },
  ) {
    const context = useContext();
    const { log } = context;

    const schema = _def.schema[step];
    log("data", context.data);
    const form = useZodForm({
      schema: schema!,
      defaultValues: {
        ...opts?.defaultValues,
        ...context.data[step],
      },
    });
    const stateSaved = useRef(false);

    const saveStateDebounced = React.useCallback(async () => {
      if (stateSaved.current) {
        return;
      }
      setTimeout(() => {
        stateSaved.current = false;
      }, 100);
      stateSaved.current = true;
      log("saving state", step, form.getValues());

      const data: $PartialData = {};
      data[step] = form.getValues();
      await context.patchData(data);
    }, []);

    useOnMount(() => {
      log("mount");
      // set draft data on unmount
      return () => {
        void saveStateDebounced().catch(() => {
          // no-op
        });

        const data: $PartialData = {};
        data[step] = form.getValues();

        log("--------- setting draft data because of unmount", {
          step,
          data,
        });
      };
    });
    const handleSubmit = React.useCallback(
      async (values: $Data[TStep]) => {
        log("submitting and saving state", values);
        await saveStateDebounced();

        let nextStep = (opts?.nextStep ?? null) as $Step | null;

        // go to next step
        if (_def.linear) {
          nextStep = _def.steps[_def.steps.indexOf(step) + 1];
          log("linear form: next step", nextStep);
        }

        if (!nextStep) {
          throw new Error(
            `No next step found for step ${step} - we need a manual handleSubmit function or pass nextStep as a prop`,
          );
        }

        await context.push(nextStep as Exclude<TStep, $EndStepWithData>);
      },
      [form],
    );

    const returnedForm = form as typeof form & {
      saveState: typeof saveStateDebounced;
      formProps: {
        form: typeof form;
        handleSubmit: typeof handleSubmit;
      };
    };
    returnedForm.saveState = saveStateDebounced;
    returnedForm.formProps = {
      form,
      handleSubmit,
    };

    return returnedForm;
  };

  Wizard.useContext = function useWizard() {
    const context = useContext();

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
