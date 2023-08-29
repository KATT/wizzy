# Wizard that works with back/forward buttons

- A wizard flow has a globally unique ID for the wizard
- **and** also, optionally, have an additional id to differentiate e.g. "Add bill" vs "edit bill id X"
- We store state in [sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- When reaching any of the end steps, we clear session storage
- Whenever a step is reached - we check if it fulfills that requirements of all the previous steps, otherwise we do `router.replace(wizard.getPreviousStepRoute())`
- Snapshots are stored in the `sessionStorage` whenever we unmount a step (except for intentional prompts(?))

- Maybe: end steps are stored with the state in the query params so that going back always works(?)

## Rough API

### Session storage data structure


- Stored in `wizard_${wizard.id}_${wizard.uniqueKey}` 


```ts
interface WizardState {
    status: "pending" | "complete";
    steps: Record<StepId, {
        seen: true;
        data: unknown;
    }>
}


```

### Payment request wizard

- Start
- Login or unauth
- Select organization (not always there)
- Select payment method
    - ACH
    - Bank

- Success
- Error

```tsx
const Wizard = createWizard({
    id: 'PaymentRequestWizard',
    steps: [
        [
            'start',
            'maybeLogin',
            'authed.selectOrganization',
            'authed.method',
            'unauthed.method',
        ],
    ],
    start: 'start',
    end: ['success', 'error'],
    schema: {
        selectOrganization: z.object({
            organizationId: z.string(),
        }),
        error: z.object({
            message: z.string(),
        }),
        'authed.method': z.object({
            
        }),
    },
    variant: 'custom',
    dependencies: {
        'authed.method': ['authed.selectOrganization'],
    }
})

Wizard.step('start', (props) => {
    const viewer = useAppContextViewer();

    
    const href = ()


    return (
        <Step>
        </Step>
    );

})


Wizard.step('login', (props) => {
    return <>...</>;
})


Wizard.step('authed.method', (props) => {
    const organization = props.completed('selectOrganization');
    props.schema;
    //     ^? typeof Wizard.$types.schema['authed.method'];
    
    props.data;
    type Data = DeepPartial<typeof z.input<typeof schema>>;

    

    return <>....</>;
});


export default function PaymentWizardPage() {
    const start: typeof Wizard.$types.step = useMemo(() => {
        const { payment } = paymentRequest;
        if (payment) {
            if (payment.ok) {
                return 'success';
            } else {
                return payment.error.isSoftError ? 'start' : 'success',
            }
        }

        return 'start'; 
    }, [payment])
    return (
        <Wizard id={paymentRequest.id} />
    )
}
```



### Invoice wizard

```ts
const InvoiceWizard = createWizard({
  id: 'invoice',
  start: 'details',
  end: 'confirmation',
  steps: ['details', 'customize', 'confirmation'],
  schema: {
    details: z.object({
      id: z.string().trim().optional(),
      invoice: baseBillSchema.extend({ id: z.string().optional() }),
      attachmentId: z.string().optional().nullish(),
      paymentRequest: z.object({ message: z.string() }).optional(),
    }),
    // ?invoiceWizard=confirmation&data={{invoiceId: x, paymentRequestId: y}}
    confirmation: z.object({
      invoiceId: requiredStringSchema,
      paymentRequestId: requiredStringSchema,
    }),
    customize: customizeSchema,
  },
  dependencies: 'sequential',
});
```

### Onboarding wizard

- Can save snapshot async and continued at any point
- 

```tsx
const Wizard = createWizard({
  id: 'invoice',
  start: 'details',
  end: 'confirmation',
  steps: ['start', 'profile', 'confirmation'],
  end: ['success'],
  schema: {
    details: z.object({
        businessName: requiredString,
    }),
    owners: z.object({
        list: z.array(ownerSchema),
    }),
    success: z.object({}),
  },
  variant: 'sequential',
});


Wizard.step('details', (props) => {
    
})

Wizard.step('owners', () => {
    
})


export default function Onboarding() {
    const saveSnapshot = trpc.onboarding.saveSnapshot.useMutation();
    const [snapshot] = trpc.onboarding.snapshot.useSuspenseQuery({
        organizationId,
    });


    return <Wizard
        id={organizationId}
        start="start"
        initialState={snapshot.state}
        remoteStorage={{
            checksum: saveSnapshot.checksum,
            async save(step, values) {
                const checksum = await saveSnapshot.mutateAsync({ 
                    step,
                    values,
                });
                return checksum;
            }
        }}
        />

}
```


### Wizard internals

```tsx

type SetValue<T> = Dispatch<SetStateAction<T>>
export function useSessionStorage<T>(
  key: string,
  initialValue: T,
): [T, SetValue<T>] {
  // Get from session storage then
  // parse stored json or return initialValue
  const readValue = useCallback((): T => {
    // Prevent build error "window is undefined" but keep keep working
    if (typeof window === 'undefined') {
      return initialValue
    }

    try {
      const item = window.sessionStorage.getItem(key)
      return item ? (parseJSON(item) as T) : initialValue
    } catch (error) {
      console.warn(`Error reading sessionStorage key “${key}”:`, error)
      return initialValue
    }
  }, [initialValue, key])

  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(readValue)

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to sessionStorage.
  const setValue: SetValue<T> = useEventCallback(value => {
    // Prevent build error "window is undefined" but keeps working
    if (typeof window == 'undefined') {
      console.warn(
        `Tried setting sessionStorage key “${key}” even though environment is not a client`,
      )
    }

    try {
      // Allow value to be a function so we have the same API as useState
      const newValue = value instanceof Function ? value(storedValue) : value

      // Save to session storage
      window.sessionStorage.setItem(key, JSON.stringify(newValue))

      // Save state
      setStoredValue(newValue)

      // We dispatch a custom event so every useSessionStorage hook are notified
      window.dispatchEvent(new Event('session-storage'))
    } catch (error) {
      console.warn(`Error setting sessionStorage key “${key}”:`, error)
    }
  })

  useEffect(() => {
    setStoredValue(readValue())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStorageChange = useCallback(
    (event: StorageEvent | CustomEvent) => {
      if ((event as StorageEvent)?.key && (event as StorageEvent).key !== key) {
        return
      }
      setStoredValue(readValue())
    },
    [key, readValue],
  )

  // this only works for other documents, not the current one
  useEventListener('storage', handleStorageChange)

  // this is a custom event, triggered in writeValueTosessionStorage
  // See: useSessionStorage()
  useEventListener('session-storage', handleStorageChange)

  return [storedValue, setValue]
}

// A wrapper for "JSON.parse()"" to support "undefined" value
function parseJSON<T>(value: string | null): T | undefined {
  try {
    return value === 'undefined' ? undefined : JSON.parse(value ?? '')
  } catch {
    console.log('parsing error on', { value })
    return undefined
  }
}

function jsonParseOrNull(obj: unknown): Record<string, unknown> | null {
    if (!isString(obj)) {
        return null;
    }
    try {
        return JSON.parse(obj)
    } catch {
        // noop
    }
    return null;
}
function createWizard<
    TSteps extends [string, ...string], 
    TEndStep extends TSteps[],
    TSchema extends Partial<Record<TSteps[number], z.ZodType>>,
    TSequential extends boolean
>(_def: {
    id: string;
    steps: TSteps;
    end: TEndStep[];
    schema: TSchema;
    sequential: TSequential;
}) {
    type Step = Steps[number];
    type Data = {
        [TStep in keyof TSchema]: TSchema[TStep]['_input'];
    }

    const stepQueryKey = `${_def.id}_step`;
    const dataQueryKey = `${_def.id}_data`;

    const [Provider, useContext] = createCtx<{
        start: TStep;
        currentStep: TStep;
        data: DeepPartial<Data>;
    }>();

    const steps: Record<string, Component> = {};

    function Wizard<TStart extends TStep>(props: {
        id: string;
        start: TStep;
    } & TStep extends TEndStep 
        ?
        undefined extends Data[TStep] 
        ? never 
        : {
            data: Data[TStep]
        }
        }: never) {
        // step is controlled by the url
        const router = useRouter()

        const [wizardData, setWizardData] = useSessionStorage();

        /**
         * The current step is set by the url but we make sure we cannot navigate to a step if we don't have fulfilled the data requirements for it
         * 
         **/
        const queryStep = stringOrNull(router.query[id]);
        const requestedStep: Step | null = queryStep && _def.steps.includes(queryStep) ? queryStep as Step : null;
        const stepData = useMemo(() => props.data ?? jsonParseOrNull(router.query[dataQueryKey]), [router.query[dataQueryKey]]);

        const prevStep = useRef<Step | null>(null);

        
        let currentStep: Step = useMemo(() => {
            // check if requestedStep is a valid step
            if (!requestedStep || requestedStep === props.start) {
                return props.start;
            }

            const isEndStep = _def.endSteps.includes(requestedStep);


            if (isEndStep) {
                // for end steps we validate the data
                const schema = _def.schema[requestedStep];
                if (schema && !schema.safeParse(stepData).success) {
                    return props.start;
                }
                return requestedStep;
            }

            if (_def.sequential && !_def.steps.every((step, index) => {
                // check all previous steps' data requirements are fulfilled
                if (index >= _def.steps.indexOf(currentStep)) {
                    return true;
                }

                const schema = _def.schema[step];
                return schema.safeParse(wizardData[step]).ok
            })) {
                return props.start;
            }


            return requestedStep;
        }, []);

        useOnMount(() => {
            if (isEndStep) {
                // reset wizard when we reach the end step
                resetWizard();
            }
        })

        useEffect(() => {
            // fix query params when clicking back after completing a step
            if (requestedStep !== currentStep) {
                void router.replace({
                    query: omit(router.query, stepQueryKey),
                });
            }
            
            
        }, [router.query]);


        const transitionType = 
            prevStep && _def.steps.indexOf(prevStep) > _def.steps.indexOf(currentStep) 
                ? 'backward' 
                : 'forward';

        return (
            <Provider 
                value={{
                    // ...
                }}
            >

            {Object.entries(_def.steps).map(([step, children]) => (
                <Wizard.Transition
                    key={step}
                    show={step === wizard.selected}
                    transitionType={transitionType}
                    >
                        {children as ReactNode}
                </Wizard.Transition>
            ))}
            </Provider>
        );

    }

    Wizard.useForm = function useForm<TStep extends Step>(props: {
        step: TStep;
        handleSubmit?: (values: typeof _def.schema[step]._output) => 
    }) {
        const schema = _def.schema[step];
        const form = useZodForm({
            schema,
            defaultValues: context.data?.[step],
        });

        const setStepData = useCallback(() => {
            context.setStepData(step, form.getValues());
        }, []);
        useOnMount(() => {
            if (isEndingStep) {
                return;
            }
            // set data on unmount
            return () => {
                setStepData();
            }
        });

        return {
            form,
            handleSubmit() {
                
                setStepData();
            }
        }


    }
    

    // Would be nicer, but reqs refactoring all forms:
    // Wizard.step = function createStep<TStep extends Step>(step: TStep, Component: Component<{
    //     data<T extends TStep>() {

    //     },
    //     form: UseZodForm<>
    // }>) {
    //     if (steps[step]) {
    //         throw new Error(`Duplicate step registered ${step}`)
    //     }

    //     Component.displayName = `WizardStep_${step}`;
    //     const isEndingStep = _def.end.includes(step);

    //     steps[step] = function Step() {
    //         const context = useContext();


            
    //         return (
    //             <>
    //                 <Component />
    //             </>
    //         )
    //     }
    //     steps[step].displayName = `Step(${Component.displayName})`
    // }

    return Wizard;
}

```


## Builder

```tsx

const wizard = createWizard({
  steps: ['start', 'login', 'selectOrganization'],
})
const startStep = wizard.step('start');

const selectOrganizationStep = startStep.step('selectOrganization');
const loginStep = startStep.step('login')

```



## Playground
```tsx

import React, {ComponentType, createContext} from 'react';
import {useRouter} from 'next/router';
import type {PartialDeep} from 'type-fest'
import z, {ZodType} from 'zod'

export type DistributiveOmit<T, TKeys extends keyof T> = T extends unknown
  ? Omit<T, TKeys>
  : never;

/**
 * Omit keys from an object.
 * @example
 * omit({foo: 'bar', baz: '1'}, 'baz'); // -> { foo: 'bar' }
 * omit({foo: 'bar', baz: '1'}, ['baz']); // -> { foo: 'bar' }
 * omit({foo: 'bar', baz: '1'}, 'foo', 'baz'); // -> {}
 * omit({foo: 'bar', baz: '1'}, ['foo', 'baz']); // -> {}
 */
export function omit<
  TObj extends Record<string, unknown>,
  TKey extends keyof TObj,
>(obj: TObj, ...keys: TKey[] | [TKey[]]): DistributiveOmit<TObj, TKey> {
  const actualKeys: string[] = Array.isArray(keys[0])
    ? (keys[0] as string[])
    : (keys as string[]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newObj: any = Object.create(null);
  for (const key in obj) {
    if (!actualKeys.includes(key)) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}
function isString(data: unknown): data is string {
    return typeof data === 'string';
}
function stringOrNull(data: unknown): null | string {
    return isString(data) ? data : null;
}
function createCtx<TContext>() {
    const Context = createContext<TContext>(null as any);
    return [Context.Provider, () => React.useContext(Context)] as const;
}
function useSessionStorage(key: string) {
    return null as any;
}

function jsonParseOrNull(obj: unknown): Record<string, unknown> | null {
    if (!isString(obj)) {
        return null;
    }
    try {
        return JSON.parse(obj)
    } catch {
        // noop
    }
    return null;
}
function useOnMount(_callback: () => void | (() => void)) {

}
function createWizard<
    TStepTuple extends string[],
    TEndTuple extends string[],
    TSchemaRecord extends Partial<Record<TStepTuple[number] | TEndTuple[number], ZodType>>,
    TLinear extends boolean
>(config: {
    id: string;
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

    type $Step = TStepTuple[number];
    type $EndStep = TEndTuple[number];
    type $AnyStep = $Step | $EndStep;
    type $Data = { 
        [TStep in keyof TSchemaRecord]: AssertZodType<TSchemaRecord[TStep]>['_input'];
    };
    type $DataStep = keyof $Data
    
    type $SetStepDataFunction = <TStep extends $DataStep>(step: TStep, data: $Step) => void;
    type $GoToStepFunction = <TStep extends $AnyStep>(...args: TStep extends)
    // </Generics>

    
    // <Variables>
    const stepsAndEndSteps = [...config.steps, ...config.end]

    const stepQueryKey = `${config.id}_step`;
    const dataQueryKey = `${config.id}_data`;

    const $types = null as unknown as {
        Step: Step;
        EndStep: $EndStep;
        AnyStep: $AnyStep;
        Data: $Data;
        DataStep: DataStep;
    }
    // </Variables>


    function isEndStep(step: $AnyStep): step is $EndStep {
        return config.end.includes(step as any);
    }
    

    const [Provider, useContext] = createCtx<{
        start: $AnyStep;
        currentStep: $AnyStep;
        data: PartialDeep<$Data>;
    }>();

    function Wizard<TStart extends $Step>(props: {
        id: string;
        start: TStart;
    } & (TStart extends TEndTuple[number] 
        ?
        undefined extends $Data[TStart] 
        ? never 
        : {
            data: $Data[TStart]
        }: never)) {
        // step is controlled by the url
        const router = useRouter()
        

        const [wizardDataInner, setWizardData] = useSessionStorage(config.id + '_' + props.id);


        /**
         * The current step is set by the url but we make sure we cannot navigate to a step if we don't have fulfilled the data requirements for it
         * 
         **/
        const queryStep = stringOrNull(router.query[config.id]);
        const requestedStep: $Step | null = queryStep && stepsAndEndSteps.includes(queryStep) ? queryStep as $Step : null;


        /**
         * Data passed through URL - always contextual to the step we're navigating too (we cannot deep link into a flow)
         */
        const queryStepData = React.useMemo(() => 
            jsonParseOrNull(router.query[dataQueryKey]), 
            [router.query[dataQueryKey]]
        );
        const stepData = React.useMemo(() => jsonParseOrNull(router.query[dataQueryKey]), [router.query[dataQueryKey]]);

        const prevStep = React.useRef<$Step | null>(null);

        let currentStep: $Step = React.useMemo(() => {
            if (queryStepData) {
                // queryStepData needs to be consumed in the context before usage
                return prevStep.current ?? props.start;
            }
            // check if requestedStep is a valid step
            if (!requestedStep || requestedStep === props.start) {
                return props.start;
            }


            const isEndStep = config.end.includes(requestedStep as any);


            if (isEndStep) {
                // for end steps we validate the data
                const schema = config.schema[requestedStep];
                if (schema && !schema.safeParse(stepData).success) {
                    return props.start;
                }
                return requestedStep;
            }

            if (config.linear && !config.steps.every((step, index) => {
                // check all previous steps' data requirements are fulfilled
                if (index >= config.steps.indexOf(currentStep)) {
                    return true;
                }

                const schema = (config.schema as Record<string, ZodType>)[step];
                return !schema || schema.safeParse(wizardDataInner[step]).success;
            })) {
                // if they arent' fulfilled, go to start step
                return props.start;
            }


            return requestedStep;
        }, []);

        useOnMount(() => {
            if (isEndStep(currentStep)) {
                // reset wizard when we reach the end step
                // resetWizard();
            }
        })

        React.useEffect(() => {
            // fix query params when clicking back after completing a step
            if (requestedStep === currentStep) {
                return;
            }

            if (queryStepData) {
                // consume query step data
                setWizardData((obj) => {
                    const newObj = {...obj};
                    for (const key in queryStepData) {
                        newObj[key] = {
                            ...obj[key],
                            ...queryStepData[key] as Record<string, unknown>,
                        }
                    }
                    
                    return newObj;
                })
            }
            
            void router.replace({
                query: omit(router.query, stepQueryKey, dataQueryKey),
            });
            
            
        }, [router.query]);


        const transitionType = 
            prevStep.current && config.steps.indexOf(prevStep.current) > config.steps.indexOf(currentStep) 
                ? 'backward' 
                : 'forward';

        
        prevStep.current = currentStep;
        return (
            <Provider 
                value={{
                    // ...
                } as any}
            >

            {Object.entries(config.steps).map(([step, children]) => (
                <Wizard.Transition
                    key={step}
                    show={step === wizard.selected}
                    transitionType={transitionType}
                    >
                        {children as React.ReactNode}
                </Wizard.Transition>
            ))}
            </Provider>
        );

    }
    Wizard.$types = $types;

    Wizard.useForm = function useForm<TStep extends keyof TSchemaRecord>(step: TStep, opts: {
        handleSubmit?: (values: $Data[TStep]) => Promise<void>
    }) {
        const schemas = config.schema as Required<TSchemaRecord>;

        const context = useContext();

        const schema = schemas[props.step];
        const form = useZodForm({
            schema,
            defaultValues: context.data?.[step],
        });

        const setStepData = React.useCallback(() => {
            context.setStepData(step, form.getValues());
        }, []);
        useOnMount(() => {
            if (!isEndStep(props.step as $Step)) {
                return;
            }
            // set data on unmount
            return () => {
                setStepData();
            }
        });

        return {
            form,
            handleSubmit(values) {
                props.handleSubmit?.(values);
                setStepData();
            }
        }


    }

    Wizard.useContext = function useWizard(): ({
        
    }) {
        throw 'unimplemented'
    }
    

    // Would be nicer, but reqs refactoring all forms:
    // Wizard.step = function createStep<TStep extends Step>(step: TStep, Component: Component<{
    //     data<T extends TStep>() {

    //     },
    //     form: UseZodForm<>
    // }>) {
    //     if (steps[step]) {
    //         throw new Error(`Duplicate step registered ${step}`)
    //     }

    //     Component.displayName = `WizardStep_${step}`;
    //     const isEndingStep = config.end.includes(step);

    //     steps[step] = function Step() {
    //         const context = useContext();


            
    //         return (
    //             <>
    //                 <Component />
    //             </>
    //         )
    //     }
    //     steps[step].displayName = `Step(${Component.displayName})`
    // }

    return Wizard;
}


const Wiz = createWizard({
    steps: ['one', 'two'],
    end: ['three'],
    id: 'testing',
    schema: {
        three: z.object({
            id: z.string(),
        })
    },
    linear: true,
})

Wiz.useForm('three', {
    async handleSubmit(values) {

    }
})

Wiz.$types.Data.three


```