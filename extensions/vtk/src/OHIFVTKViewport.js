import React, { Component } from 'react';
import { getImageData, loadImageData } from 'react-vtkjs-viewport';
import ConnectedVTKViewport from './ConnectedVTKViewport';
import LoadingIndicator from './LoadingIndicator.js';
import OHIF from '@ohif/core';
import PropTypes from 'prop-types';
import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

const segmentationModule = cornerstoneTools.getModule('segmentation');

const { StackManager } = OHIF.utils;

// TODO: Figure out where we plan to put this long term
const volumeCache = {};
const labelmapCache = {};

/**
 * Create a labelmap image with the same dimensions as our background volume.
 *
 * @param backgroundImageData vtkImageData
 */
/* TODO: Not currently used until we have drawing tools in vtkjs.
function createLabelMapImageData(backgroundImageData) {
  // TODO => Need to do something like this if we start drawing a new segmentation
  // On a vtkjs viewport.

  const labelMapData = vtkImageData.newInstance(
    backgroundImageData.get('spacing', 'origin', 'direction')
  );
  labelMapData.setDimensions(backgroundImageData.getDimensions());
  labelMapData.computeTransforms();

  const values = new Uint8Array(backgroundImageData.getNumberOfPoints());
  const dataArray = vtkDataArray.newInstance({
    numberOfComponents: 1, // labelmap with single component
    values,
  });
  labelMapData.getPointData().setScalars(dataArray);

  return labelMapData;
} */

class OHIFVTKViewport extends Component {
  state = {
    volumes: null,
    paintFilterLabelMapImageData: null,
    paintFilterBackgroundImageData: null,
  };

  static propTypes = {
    viewportData: PropTypes.shape({
      studies: PropTypes.array,
      displaySet: PropTypes.shape({
        StudyInstanceUID: PropTypes.string,
        displaySetInstanceUID: PropTypes.string,
        sopClassUIDs: PropTypes.arrayOf(PropTypes.string),
        SOPInstanceUID: PropTypes.string,
        frameIndex: PropTypes.number,
      }),
    }),
    viewportIndex: PropTypes.number,
    children: PropTypes.node,
    onScroll: PropTypes.func,
  };

  static defaultProps = {
    onScroll: () => {},
  };

  static id = 'OHIFVTKViewport';

  static init() {
    console.log('OHIFVTKViewport init()');
  }

  static destroy() {
    console.log('OHIFVTKViewport destroy()');
    StackManager.clearStacks();
  }

  static getCornerstoneStack(
    studies,
    StudyInstanceUID,
    displaySetInstanceUID,
    SOPInstanceUID,
    frameIndex
  ) {
    // Create shortcut to displaySet
    const study = studies.find(
      study => study.StudyInstanceUID === StudyInstanceUID
    );

    const displaySet = study.displaySets.find(set => {
      return set.displaySetInstanceUID === displaySetInstanceUID;
    });

    // Get stack from Stack Manager
    const storedStack = StackManager.findOrCreateStack(study, displaySet);

    // Clone the stack here so we don't mutate it
    const stack = Object.assign({}, storedStack);

    if (frameIndex !== undefined) {
      stack.currentImageIdIndex = frameIndex;
    } else if (SOPInstanceUID) {
      const index = stack.imageIds.findIndex(imageId => {
        const imageIdSOPInstanceUID = cornerstone.metaData.get(
          'SOPInstanceUID',
          imageId
        );

        return imageIdSOPInstanceUID === SOPInstanceUID;
      });

      if (index > -1) {
        stack.currentImageIdIndex = index;
      }
    } else {
      stack.currentImageIdIndex = 0;
    }

    return stack;
  }

  getViewportData = (
    studies,
    StudyInstanceUID,
    displaySetInstanceUID,
    SOPClassUID,
    SOPInstanceUID,
    frameIndex
  ) => {
    const stack = OHIFVTKViewport.getCornerstoneStack(
      studies,
      StudyInstanceUID,
      displaySetInstanceUID,
      SOPClassUID,
      SOPInstanceUID,
      frameIndex
    );

    const imageDataObject = getImageData(stack.imageIds, displaySetInstanceUID);
    let labelmapDataObject;
    let labelmapColorLUT;

    const firstImageId = stack.imageIds[0];
    const { state } = segmentationModule;
    const brushStackState = state.series[firstImageId];

    if (brushStackState) {
      const { activeLabelmapIndex } = brushStackState;
      const labelmap3D = brushStackState.labelmaps3D[activeLabelmapIndex];

      this.segmentsDefaultProperties = labelmap3D.segmentsHidden.map(
        isHidden => {
          return { visible: !isHidden };
        }
      );

      const vtkLabelmapID = `${firstImageId}_${activeLabelmapIndex}`;

      if (labelmapCache[vtkLabelmapID]) {
        labelmapDataObject = labelmapCache[vtkLabelmapID];
      } else {
        // TODO -> We need an imageId based getter in cornerstoneTools
        const labelmapBuffer = labelmap3D.buffer;

        // Create VTK Image Data with buffer as input
        labelmapDataObject = vtkImageData.newInstance();

        // TODO: Not a general solution - Only support for one fractional segment!
        // ======= Fork from master.  ========

        let dataArray;

        if (labelmap3D.isFractional) {
          // We need to set this or it will be crazy, as each color is a different segment.

          dataArray = vtkDataArray.newInstance({
            numberOfComponents: 1, // labelmap with single component
            values: new Uint8Array(labelmap3D.probabilityBuffer),
          });
        } else {
          dataArray = vtkDataArray.newInstance({
            numberOfComponents: 1, // labelmap with single component
            values: new Uint16Array(labelmapBuffer),
          });
        }

        // ======== End fork from master. ========

        labelmapDataObject.getPointData().setScalars(dataArray);
        labelmapDataObject.setDimensions(...imageDataObject.dimensions);
        labelmapDataObject.setSpacing(
          ...imageDataObject.vtkImageData.getSpacing()
        );
        labelmapDataObject.setOrigin(
          ...imageDataObject.vtkImageData.getOrigin()
        );
        labelmapDataObject.setDirection(
          ...imageDataObject.vtkImageData.getDirection()
        );

        // Cache the labelmap volume.
        labelmapCache[vtkLabelmapID] = labelmapDataObject;
      }

      // TODO: Not a general solution - Only support for one fractional segment!
      // ======= Fork from master.  ========
      if (labelmap3D.isFractional) {
        if (
          Array.isArray(state.colorLutTables[labelmap3D.colorLUTIndex][1][0])
        ) {
          // Using a colormap, copy it.
          labelmapColorLUT = state.colorLutTables[labelmap3D.colorLUTIndex][1];
        } else {
          // Derive a colormap with 256 colors
          // TODO -> This doesn't work well as its volume rendering, so opacity layers and it saturates/
          // Shows you the incorrect value.
          labelmapColorLUT = [];
          const color = state.colorLutTables[labelmap3D.colorLUTIndex][1];

          for (let i = 0; i < 256; i++) {
            labelmapColorLUT.push([color[0], color[1], color[2], i]);
          }
        }
      } else {
        labelmapColorLUT = state.colorLutTables[labelmap3D.colorLUTIndex];
      }

      // ======== End fork from master. ========
    }

    return {
      imageDataObject,
      labelmapDataObject,
      labelmapColorLUT,
    };
  };

  /**
   *
   *
   * @param {object} imageDataObject
   * @param {object} imageDataObject.vtkImageData
   * @param {object} imageDataObject.imageMetaData0
   * @param {number} [imageDataObject.imageMetaData0.WindowWidth] - The volume's initial WindowWidth
   * @param {number} [imageDataObject.imageMetaData0.WindowCenter] - The volume's initial WindowCenter
   * @param {string} imageDataObject.imageMetaData0.Modality - CT, MR, PT, etc
   * @param {string} displaySetInstanceUID
   * @returns vtkVolumeActor
   * @memberof OHIFVTKViewport
   */
  getOrCreateVolume(imageDataObject, displaySetInstanceUID) {
    if (volumeCache[displaySetInstanceUID]) {
      return volumeCache[displaySetInstanceUID];
    }

    const { vtkImageData, imageMetaData0 } = imageDataObject;
    // TODO -> Should update react-vtkjs-viewport and react-cornerstone-viewports
    // internals to use naturalized DICOM JSON names.
    const {
      windowWidth: WindowWidth,
      windowCenter: WindowCenter,
      modality: Modality,
    } = imageMetaData0;

    const { lower, upper } = _getRangeFromWindowLevels(
      WindowWidth,
      WindowCenter,
      Modality
    );
    const volumeActor = vtkVolume.newInstance();
    const volumeMapper = vtkVolumeMapper.newInstance();

    volumeActor.setMapper(volumeMapper);
    volumeMapper.setInputData(vtkImageData);

    volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .setRange(lower, upper);

    const spacing = vtkImageData.getSpacing();
    // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
    // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
    const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6;

    volumeMapper.setSampleDistance(sampleDistance);

    // Be generous to surpress warnings, as the logging really hurts performance.
    // TODO: maybe we should auto adjust samples to 1000.
    volumeMapper.setMaximumSamplesPerRay(4000);

    volumeCache[displaySetInstanceUID] = volumeActor;

    return volumeActor;
  }

  setStateFromProps() {
    const { studies, displaySet } = this.props.viewportData;
    const {
      StudyInstanceUID,
      displaySetInstanceUID,
      sopClassUIDs,
      SOPInstanceUID,
      frameIndex,
    } = displaySet;

    if (sopClassUIDs.length > 1) {
      console.warn(
        'More than one SOPClassUID in the same series is not yet supported.'
      );
    }

    const study = studies.find(
      study => study.StudyInstanceUID === StudyInstanceUID
    );

    const dataDetails = {
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      studyDescription: study.studyDescription,
      patientName: study.patientName,
      patientId: study.patientId,
      seriesNumber: String(displaySet.seriesNumber),
      seriesDescription: displaySet.seriesDescription,
    };

    const {
      imageDataObject,
      labelmapDataObject,
      labelmapColorLUT,
    } = this.getViewportData(
      studies,
      StudyInstanceUID,
      displaySetInstanceUID,
      SOPInstanceUID,
      frameIndex
    );

    this.imageDataObject = imageDataObject;

    /* TODO: Not currently used until we have drawing tools in vtkjs.
    if (!labelmap) {
      labelmap = createLabelMapImageData(data);
    } */

    const volumeActor = this.getOrCreateVolume(
      imageDataObject,
      displaySetInstanceUID
    );

    this.setState(
      {
        percentComplete: 0,
        dataDetails,
      },
      () => {
        this.loadProgressively(imageDataObject);

        // TODO: There must be a better way to do this.
        // We do this so that if all the data is available the react-vtkjs-viewport
        // Will render _something_ before the volumes are set and the volume
        // Construction that happens in react-vtkjs-viewport locks up the CPU.
        setTimeout(() => {
          this.setState({
            volumes: [volumeActor],
            paintFilterLabelMapImageData: labelmapDataObject,
            paintFilterBackgroundImageData: imageDataObject.vtkImageData,
            labelmapColorLUT,
          });
        }, 200);
      }
    );
  }

  componentDidMount() {
    this.setStateFromProps();
  }

  componentDidUpdate(prevProps, prevState) {
    const { displaySet } = this.props.viewportData;
    const prevDisplaySet = prevProps.viewportData.displaySet;

    if (
      displaySet.displaySetInstanceUID !==
        prevDisplaySet.displaySetInstanceUID ||
      displaySet.SOPInstanceUID !== prevDisplaySet.SOPInstanceUID ||
      displaySet.frameIndex !== prevDisplaySet.frameIndex
    ) {
      this.setStateFromProps();
    }
  }

  loadProgressively(imageDataObject) {
    loadImageData(imageDataObject);

    const { isLoading, insertPixelDataPromises } = imageDataObject;

    const NumberOfFrames = insertPixelDataPromises.length;

    if (!isLoading) {
      this.setState({ isLoaded: true });
      return;
    }

    insertPixelDataPromises.forEach(promise => {
      promise.then(numberProcessed => {
        const percentComplete = Math.floor(
          (numberProcessed * 100) / NumberOfFrames
        );

        if (percentComplete !== this.state.percentComplete) {
          this.setState({
            percentComplete,
          });
        }
      });
    });

    Promise.all(insertPixelDataPromises).then(() => {
      this.setState({
        isLoaded: true,
      });
    });
  }

  render() {
    let childrenWithProps = null;
    const { configuration } = segmentationModule;

    // TODO: Does it make more sense to use Context?
    if (this.props.children && this.props.children.length) {
      childrenWithProps = this.props.children.map((child, index) => {
        return (
          child &&
          React.cloneElement(child, {
            viewportIndex: this.props.viewportIndex,
            key: index,
          })
        );
      });
    }

    const style = { width: '100%', height: '100%', position: 'relative' };

    return (
      <>
        <div style={style}>
          {!this.state.isLoaded && (
            <LoadingIndicator percentComplete={this.state.percentComplete} />
          )}
          {this.state.volumes && (
            <ConnectedVTKViewport
              volumes={this.state.volumes}
              paintFilterLabelMapImageData={
                this.state.paintFilterLabelMapImageData
              }
              paintFilterBackgroundImageData={
                this.state.paintFilterBackgroundImageData
              }
              viewportIndex={this.props.viewportIndex}
              dataDetails={this.state.dataDetails}
              labelmapRenderingOptions={{
                colorLUT: this.state.labelmapColorLUT,
                globalOpacity: configuration.fillAlpha,
                visible: configuration.renderFill,
                outlineThickness: configuration.outlineWidth,
                renderOutline: configuration.renderOutline,
                segmentsDefaultProperties: this.segmentsDefaultProperties,
                onNewSegmentationRequested: () => {
                  this.setStateFromProps();
                },
              }}
              onScroll={this.props.onScroll}
            />
          )}
        </div>
        )}
        {childrenWithProps}
      </>
    );
  }
}

/**
 * Takes window levels and converts them to a range (lower/upper)
 * for use with VTK RGBTransferFunction
 *
 * @private
 * @param {number} [width] - the width of our window
 * @param {number} [center] - the center of our window
 * @param {string} [Modality] - 'PT', 'CT', etc.
 * @returns { lower, upper } - range
 */
function _getRangeFromWindowLevels(width, center, Modality = undefined) {
  // For PET just set the range to 0-5 SUV
  if (Modality === 'PT') {
    return { lower: 0, upper: 5 };
  }

  const levelsAreNotNumbers = isNaN(center) || isNaN(width);

  if (levelsAreNotNumbers) {
    return { lower: 0, upper: 512 };
  }

  return {
    lower: center - width / 2.0,
    upper: center + width / 2.0,
  };
}

export default OHIFVTKViewport;
