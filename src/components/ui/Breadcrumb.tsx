/**
 * @file Breadcrumb.tsx
 * @component Breadcrumb
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A visual breadcrumb navigation component that displays up to three levels
 * of navigation, each with an optional callback. UI is customizable via
 * plugin configuration based on the current component name.
 *
 * @return {JSX.Element} The rendered breadcrumb navigation.
 */

import { FaChevronLeft } from 'react-icons/fa';
import { usePlugin } from '../../context/pluginContext';

/**
 * @interface BreadcrumbProps
 *
 * @description
 * Props for the `Breadcrumb` component.
 *
 * @property {() => void} levelOneCallback - Callback for the first breadcrumb level.
 * @property {() => void} [levelTwoCallback] - Optional callback for the second breadcrumb level.
 * @property {() => void} [levelThreeCallback] - Optional callback for the third breadcrumb level.
 * @property {string} levelOneText - Text label for the first breadcrumb level.
 * @property {string | null} [levelTwoText] - Optional text for the second breadcrumb level.
 * @property {string | null} [levelThreeText] - Optional text for the third breadcrumb level.
 */
interface BreadcrumbProps {
  levelOneCallback: () => void;
  levelTwoCallback?: () => void;
  levelThreeCallback?: () => void;
  levelOneText: string;
  levelTwoText?: string | null;
  levelThreeText?: string | null;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({
  levelOneCallback,
  levelOneText,
  levelTwoCallback,
  levelTwoText,
  levelThreeCallback,
  levelThreeText
}) => {
  const { boomiConfig } = usePlugin();
  return (
    <div
      className="
        pl-4 pt-2 text-sm
        [background-color:var(--boomi-header-bg-color)]
        [color:var(--boomi-header-fg-color)]
      "
    >
      <nav aria-label="Breadcrumb" className='flex' role="navigation">
        <ol className={`list-none p-0 inline-flex items-center`}>
          <li className="flex items-center">
            <button
              onClick={levelOneCallback}
              className='flex items-center no-underline cursor-pointer boomi-breadcrumb-link'>
              <FaChevronLeft className={`mr-2`} />
              {levelOneText}
            </button>
          </li>
          {levelTwoText && (
            <li className="flex items-center">
              <button
                onClick={levelTwoCallback}
                className='flex items-center no-underline cursor-pointer boomi-breadcrumb-link'>
                <FaChevronLeft className={`mr-2 ml-2`} />
                {levelTwoText}
              </button>
            </li>
          )}
          {levelThreeText && (
            <li className="flex items-center">
              <button
                onClick={levelThreeCallback}
                className='flex items-center no-underline cursor-pointer boomi-breadcrumb-link'>
                <FaChevronLeft className={`mr-2 ml-2`} />
                {levelThreeText}
              </button>
            </li>
          )}
        </ol>
      </nav>
    </div>
  );
}

export default Breadcrumb;
