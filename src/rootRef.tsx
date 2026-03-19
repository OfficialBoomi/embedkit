/**
 * @file rootRef.tsx
 *
 * @description
 * A singleton React ref object to be used for the root component.
 * This can be used to access methods or properties of the root component from outside React.
 */
import { createRef } from 'react';
import type { RootRef } from './components/Root';

const rootRef = createRef<RootRef>();
export default rootRef;