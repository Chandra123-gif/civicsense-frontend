import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/ReportIssue.css';
import * as tf from "@tensorflow/tfjs";
import * as mobilenet from "@tensorflow-models/mobilenet";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { API_BASE_URL } from "../config";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

// Keyword mapping for issue types (MobileNet ImageNet labels)
const ISSUE_KEYWORDS = {

  // 1️⃣ Pothole (Surface cavity only)
  pothole: [
    'pothole',
    'road crack',
    'asphalt crack',
    'broken asphalt',
    'road cavity',
    'crater',
    'road depression',
    'surface hole',
    'collapsed asphalt',
    'circular hole in road',
    'damaged pavement surface',
    'cracked tar',
    'bitumen crack',
    'road surface fracture',
    'sunken asphalt',
    'uneven road surface',
    'asphalt erosion',
    'blacktop crack',
    'pavement fracture',
    'road sinkhole',
    'surface cavity',
    'road rupture',
    'tar road crack',
    'road surface damage',
    'asphalt surface break',
    'cracked roadway',
    'eroded asphalt',
    'damaged tar surface',
    'road hole damage',
    'road wear erosion'
  ],

  // 2️⃣ Garbage (Waste objects only)
  garbage: [
    'trash',
    'garbage',
    'plastic waste',
    'plastic bottle',
    'paper plate',
    'food waste',
    'waste pile',
    'litter',
    'trash bag',
    'overflowing bin',
    'garbage bag',
    'waste container',
    'dumpster',
    'scattered waste',
    'dirty waste',
    'waste heap',
    'rubbish',
    'recyclable waste',
    'metal can',
    'discarded bottle',
    'polythene bag',
    'paper waste',
    'household waste',
    'organic waste',
    'rotting waste',
    'trash can',
    'waste barrel',
    'junk pile',
    'refuse waste',
    'waste overflow area'
  ],

  // 3️⃣ Streetlight Failure (Lighting infrastructure only)
  streetlight: [
    'street light',
    'lamp post',
    'light pole',
    'streetlamp',
    'traffic signal light',
    'signal pole',
    'electric pole',
    'lamp fixture',
    'broken light bulb',
    'damaged streetlamp',
    'lighting pole',
    'roadside lamp',
    'public lighting pole',
    'lamp housing',
    'metal lighting pole',
    'tall light pole',
    'lighting column',
    'electric lighting unit',
    'municipal light pole',
    'lamp arm structure',
    'pole mounted lamp',
    'overhead lighting pole',
    'signal head light',
    'bulb fixture',
    'lighting infrastructure',
    'electric street lamp',
    'urban light pole',
    'road illumination pole',
    'lamp support pole',
    'street lighting unit'
  ],

  // 4️⃣ Drainage Issue (Water drainage structures only)
  drainage_issue: [
    'drain',
    'sewer',
    'manhole',
    'gutter',
    'storm drain',
    'blocked drain',
    'open manhole',
    'drain cover',
    'water overflow drain',
    'sewage water',
    'drain pipe',
    'flooded drain',
    'drainage channel',
    'drain outlet',
    'sewer lid',
    'clogged drain',
    'water logging',
    'overflowing sewer',
    'drain blockage',
    'stormwater drain',
    'drain grate',
    'sewer opening',
    'flooded gutter',
    'sewage leakage',
    'wastewater flow',
    'drain pit',
    'municipal drain channel',
    'underground sewer',
    'drain slab',
    'sewer overflow area'
  ],

  // 5️⃣ Road Structural Damage (NOT pothole)
  damaged_road: [
    'collapsed bridge',
    'broken divider',
    'damaged barrier',
    'broken guardrail',
    'road barrier damage',
    'bridge structural crack',
    'damaged flyover',
    'roadside railing',
    'concrete breakage',
    'bridge surface crack',
    'road edge collapse',
    'cracked divider structure',
    'broken curb',
    'damaged median',
    'roadside concrete break',
    'bridge damage',
    'sidewalk collapse',
    'road structure damage',
    'broken concrete slab',
    'infrastructure damage',
    'road boundary crack',
    'broken retaining wall',
    'flyover damage',
    'collapsed concrete structure',
    'road railing damage',
    'divider collapse',
    'damaged overpass',
    'cracked embankment',
    'concrete fracture',
    'roadside structure collapse'
  ],

  // 6️⃣ Other (Always allowed)
  other: []
};


// Function to check if any prediction matches issue type keywords
const validatePrediction = (predictions, issueType) => {
  if (!issueType || issueType === 'other') return { isValid: true, matchedLabels: [] };

  const keywords = ISSUE_KEYWORDS[issueType] || [];
  if (keywords.length === 0) return { isValid: true, matchedLabels: [] };

  const matchedLabels = [];

  for (const prediction of predictions) {
    const label = prediction.className.toLowerCase();
    const confidence = prediction.probability;

    // Check if any keyword matches the prediction
    for (const keyword of keywords) {
      if (label.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(label)) {
        matchedLabels.push({
          label: prediction.className,
          confidence: (confidence * 100).toFixed(1)
        });
      }
    }
  }

  // If we found matches, validation passes
  if (matchedLabels.length > 0) {
    return { isValid: true, matchedLabels };
  }

  // If no matches found, check top predictions for better UX
  const topPredictions = predictions.slice(0, 5).map(p => ({
    label: p.className,
    confidence: (p.probability * 100).toFixed(1)
  }));

  return {
    isValid: false,
    matchedLabels: [],
    topPredictions
  };
};

function ReportIssue() {
  const [formData, setFormData] = useState({
    issueType: '',
    title: '',
    description: '',
    location: {
      streetName: '',
      area: '',
      city: '',
      district: '',
      state: '',
      municipality: ''
    },
    latitude: null,
    longitude: null,
    image: null
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [previewSrc, setPreviewSrc] = useState(null);
  const [model, setModel] = useState(null);
  const [aiResult, setAiResult] = useState("");
  const [videoDevices, setVideoDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);

  // AI Validation State Variables
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null); // null | 'pass' | 'fail'
  const [detectedLabels, setDetectedLabels] = useState([]);
  const [topPredictions, setTopPredictions] = useState([]);

  // Load MobileNet model on component mount
  useEffect(() => {
    const loadModel = async () => {
      try {
        setIsModelLoading(true);
        console.log('Loading MobileNet model...');

        // Load the MobileNet model
        const loadedModel = await mobilenet.load({
          version: 2,
          alpha: 1.0
        });

        setModel(loadedModel);
        console.log('MobileNet model loaded successfully');
        setIsModelLoading(false);
      } catch (error) {
        console.error('Failed to load MobileNet model:', error);
        setIsModelLoading(false);
        setError('AI model failed to load. Image validation will be skipped.');
      }
    };

    loadModel();

    // Cleanup model from memory on unmount
    return () => {
      if (model) {
        // TensorFlow.js cleanup
        tf.disposeVariables();
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // cleanup camera stream and object URLs
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (previewSrc) URL.revokeObjectURL(previewSrc);
    };
  }, [previewSrc]);

  // Function to validate image using MobileNet
  const validateImage = async (imageUrl, issueType) => {
    if (!model) {
      console.warn('Model not loaded, skipping validation');
      return { isValid: true, matchedLabels: [] };
    }

    if (!imageUrl || !issueType) {
      return { isValid: true, matchedLabels: [] };
    }

    setIsValidating(true);
    setValidationResult(null);
    setDetectedLabels([]);
    setTopPredictions([]);

    try {
      // Create an image element
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Run classification
      const predictions = await model.classify(img);
      console.log('MobileNet predictions:', predictions);

      // Validate predictions
      const result = validatePrediction(predictions, issueType);

      setValidationResult(result.isValid ? 'pass' : 'fail');
      setDetectedLabels(result.matchedLabels);
      setTopPredictions(result.topPredictions || []);

      setIsValidating(false);
      return result;

    } catch (error) {
      console.error('Image validation error:', error);
      setIsValidating(false);
      return { isValid: true, matchedLabels: [] };
    }
  };

  const handleLocationChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      location: {
        ...formData.location,
        [name]: value
      }
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleImageChange = (e) => {
    setFormData({
      ...formData,
      image: e.target.files[0]
    });
    if (e.target.files[0]) {
      try {
        const url = URL.createObjectURL(e.target.files[0]);
        setPreviewSrc(url);
        
        // Run AI validation when image is selected
        if (formData.issueType && formData.issueType !== 'other') {
          validateImage(url, formData.issueType).then(result => {
            console.log('AI Validation result:', result);
          });
        }
      } catch (err) {
        setPreviewSrc(null);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  };

  const startCamera = async (preferBackCamera = false) => {
    setCameraError("");

    try {
      // Stop previous stream if exists
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Enumerate available video devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevicesList = devices.filter(device => device.kind === 'videoinput');
      setVideoDevices(videoDevicesList);

      // Determine which camera to use
      let selectedDeviceId = null;

      if (videoDevicesList.length > 1) {
        // If multiple cameras, try to find back camera
        const backCamera = videoDevicesList.find(device =>
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('environment')
        );

        if (preferBackCamera && backCamera) {
          selectedDeviceId = backCamera.deviceId;
        } else if (!preferBackCamera && !currentDeviceId) {
          // Default to back camera if no preference specified
          selectedDeviceId = backCamera ? backCamera.deviceId : videoDevicesList[0].deviceId;
        } else {
          selectedDeviceId = currentDeviceId || videoDevicesList[0].deviceId;
        }

        setCurrentDeviceId(selectedDeviceId);
      } else if (videoDevicesList.length === 1) {
        selectedDeviceId = videoDevicesList[0].deviceId;
        setCurrentDeviceId(selectedDeviceId);
      }

      // Build constraints
      const constraints = {
        audio: false,
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        videoRef.current.onloadeddata = () => {
          videoRef.current.play();
        };
      }

      setCameraActive(true);

    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Unable to access camera. Check permissions.");
    }
  };

  const switchCamera = async () => {
    if (videoDevices.length < 2) {
      setCameraError("Only one camera available");
      return;
    }

    const currentIndex = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];

    stopCamera();
    setCurrentDeviceId(nextDevice.deviceId);

    setTimeout(() => {
      startCamera(nextDevice.deviceId);
    }, 300);
  };

  const capturePhoto = async () => {
    try {
      const video = videoRef.current;
      if (!video) return setCameraError('Camera not ready');
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setFormData(prev => ({ ...prev, image: file }));
      const url = URL.createObjectURL(file);
      setPreviewSrc(url);
      stopCamera();
      setSuccess('Photo captured');

      // Run AI validation when photo is captured
      if (formData.issueType && formData.issueType !== 'other') {
        validateImage(url, formData.issueType).then(result => {
          console.log('AI Validation result:', result);
        });
      }
    } catch (err) {
      console.error('Capture failed', err);
      setCameraError('Capture failed');
    }
  };

  const handleCopyMunicipality = async () => {
    const muni = formData.location.municipality || '';
    if (!muni) return setError('No municipality to copy');
    try {
      await navigator.clipboard.writeText(muni);
      setSuccess('Municipality copied to clipboard');
    } catch (err) {
      setError('Failed to copy');
    }
  };

  const handleContactMunicipality = () => {
    const muni = formData.location.municipality || '';
    const subject = encodeURIComponent('Civic Issue: ' + (formData.title || formData.issueType || ''));
    const body = encodeURIComponent(`Please contact the municipality (${muni}) regarding an issue at coordinates: ${formData.latitude}, ${formData.longitude}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleChangeLocation = () => {
    // allow user to change manual fields
    setFormData({
      ...formData,
      latitude: null,
      longitude: null,
      location: {
        streetName: '', area: '', city: '', district: '', state: '', municipality: ''
      }
    });
    setSuccess('You can now enter location manually');
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        // Save coordinates first
        setFormData(prev => ({
          ...prev,
          latitude: lat,
          longitude: lon
        }));

        // Reverse geocoding with better error handling
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`, {
          headers: {
            "Accept": "application/json"
          }
        })
          .then(res => {
            if (!res.ok) {
              throw new Error("Reverse geocoding API failed");
            }
            return res.json();
          })
          .then(data => {
            if (!data || !data.address) {
              throw new Error("No address data");
            }

            const addr = data.address;

            setFormData(prev => ({
              ...prev,
              location: {
                streetName: addr.road || addr.pedestrian || addr.cycleway || '',
                area: addr.neighbourhood || addr.suburb || addr.city_district || '',
                city: addr.city || addr.town || addr.village || '',
                district: addr.county || addr.state_district || '',
                state: addr.state || '',
                municipality: addr.city || addr.town || addr.village || addr.county || ''
              }
            }));

            setSuccess('Location obtained successfully');
          })
          .catch((err) => {
            console.error('Reverse geocode failed:', err);

            // Fallback if API fails
            setFormData(prev => ({
              ...prev,
              location: {
                streetName: "GPS Location",
                area: "",
                city: `Lat: ${lat.toFixed(5)}`,
                district: "",
                state: "",
                municipality: ""
              }
            }));

            setSuccess('Location coordinates obtained (address lookup limited)');
          });
      },
      (error) => {
        setError('Could not get location: ' + error.message);
      }
    );
  };

  const handleGetDirections = () => {
    if (formData.latitude && formData.longitude) {
      const mapsUrl = `https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`;
      window.open(mapsUrl, '_blank');
    } else {
      setError('Please get location first');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login first');
      setLoading(false);
      return;
    }

    // Check AI validation before submitting
    if (formData.image && formData.issueType && formData.issueType !== 'other' && validationResult === 'fail') {
      setError('AI validation failed. The uploaded image does not match the selected issue type. Please upload a relevant image.');
      setLoading(false);
      return;
    }

    // If model is still loading or validating, wait or show error
    if (isModelLoading) {
      setError('AI model is still loading. Please wait a moment and try again.');
      setLoading(false);
      return;
    }

    if (isValidating) {
      setError('Image validation in progress. Please wait...');
      setLoading(false);
      return;
    }

    try {
      // Use FormData for file uploads (multipart/form-data)
      const fd = new FormData();
      fd.append('issueType', formData.issueType);
      fd.append('title', formData.title);
      fd.append('description', formData.description);
      fd.append('latitude', formData.latitude || '');
      fd.append('longitude', formData.longitude || '');
      fd.append('location', JSON.stringify(formData.location || {}));
      if (formData.image instanceof File) {
        fd.append('image', formData.image);
      } else if (formData.image) {
        // allow existing string/image URL/data
        fd.append('image', formData.image);
      }

      const response = await axios.post(`${API_BASE_URL}/api/issues`, fd, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        setSuccess('Issue reported successfully!');
        setFormData({
          issueType: '',
          title: '',
          description: '',
          location: {
            streetName: '',
            area: '',
            city: '',
            district: '',
            state: '',
            municipality: ''
          },
          latitude: null,
          longitude: null,
          image: null
        });
        setTimeout(() => navigate('/citizen-dashboard'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to report issue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="report-issue-container">
      <div className="report-issue-box">
        <h2>Report a Civic Issue</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Issue Type:</label>
            <div className="issue-types">
              {[
                { key: 'pothole', label: 'Pothole' },
                { key: 'garbage', label: 'Garbage Overflow' },
                { key: 'streetlight', label: 'Streetlight Failure' },
                { key: 'drainageissue', label: 'Drainage Issue' },
                { key: 'damaged_road', label: 'Road Damage' },
                { key: 'other', label: 'Other' }
              ].map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={`issue-card ${formData.issueType === t.key ? 'selected' : ''}`}
                  onClick={() => setFormData({ ...formData, issueType: t.key })}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Title</label>
            <input
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Brief description of the issue"
              required
            />
          </div>

          <div className="form-group">
            <label>Description:</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Provide detailed information about the issue"
              required
            />
          </div>

          <div className="location-section">
            <h3>Location Details</h3>
            <button type="button" className="btn-location" onClick={handleGetLocation}>
              Get Current Location
            </button>

            <div className="form-row">
              <div className="form-group">
                <label>Street Name:</label>
                <input
                  type="text"
                  name="streetName"
                  value={formData.location.streetName}
                  onChange={handleLocationChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Area:</label>
                <input
                  type="text"
                  name="area"
                  value={formData.location.area}
                  onChange={handleLocationChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>City:</label>
                <input
                  type="text"
                  name="city"
                  value={formData.location.city}
                  onChange={handleLocationChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>District:</label>
                <input
                  type="text"
                  name="district"
                  value={formData.location.district}
                  onChange={handleLocationChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>State:</label>
                <input
                  type="text"
                  name="state"
                  value={formData.location.state}
                  onChange={handleLocationChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Municipality:</label>
                <input
                  type="text"
                  name="municipality"
                  value={formData.location.municipality}
                  onChange={handleLocationChange}
                  required
                />
              </div>
            </div>

            {formData.latitude && formData.longitude && (
              <div className="location-panel">
                <div>
                  <strong>Location:</strong> {formData.location.streetName || ''} {formData.location.area ? `, ${formData.location.area}` : ''}
                  <div>{formData.location.city}{formData.location.district ? `, ${formData.location.district}` : ''}</div>
                </div>
                <div className="location-actions">
                  <button type="button" className="btn-location" onClick={() => window.open(`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`, '_blank')}>Get directions</button>
                  <button type="button" className="btn-secondary" onClick={handleCopyMunicipality}>Copy municipality</button>
                  <button type="button" className="btn-secondary" onClick={handleContactMunicipality}>Contact municipality</button>
                  <button type="button" className="btn-secondary" onClick={handleChangeLocation}>Change</button>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Upload Image:</label>
            <div className="image-upload-box">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                id="fileInput"
              />
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => document.getElementById('fileInput').click()}>Choose Image</button>
                <button type="button" className="btn-secondary" onClick={startCamera}>Use Camera</button>
              </div>

              {cameraError && <div className="error" style={{ marginTop: 8 }}>{cameraError}</div>}

              {cameraActive && (
                <div className="camera-box">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      height: "300px",
                      objectFit: "cover",
                      borderRadius: "10px",
                      background: "black"
                    }}
                  />

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn-location" onClick={capturePhoto}>Capture</button>
                    {videoDevices.length > 1 && (
                      <button type="button" className="btn-secondary" onClick={switchCamera}>Switch Camera</button>
                    )}
                    <button type="button" className="btn-secondary" onClick={stopCamera}>Close</button>
                  </div>
                </div>
              )}

              {previewSrc && (
                <div style={{ marginTop: 10 }}>
                  <img src={previewSrc} alt="preview" style={{ maxWidth: 180, borderRadius: 6 }} />
                </div>
              )}

              {/* AI Validation Results */}
              {isModelLoading && <div className="info">Loading AI model...</div>}
              {isValidating && <div className="info">Validating image...</div>}
              {validationResult && !isModelLoading && !isValidating && (
                <div className={`validation-${validationResult}`} style={{ marginTop: 10 }}>
                  {validationResult === 'pass' ? '✓ Image matches issue type' : '✗ Image does not match issue type'}
                  {detectedLabels.length > 0 && (
                    <div style={{ fontSize: '12px', marginTop: 5 }}>
                      Detected: {detectedLabels.map(l => `${l.label} (${l.confidence}%)`).join(', ')}
                    </div>
                  )}
                  {validationResult === 'fail' && topPredictions.length > 0 && (
                    <div style={{ fontSize: '12px', marginTop: 5 }}>
                      Top predictions: {topPredictions.map(l => `${l.label} (${l.confidence}%)`).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Reporting...' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ReportIssue;
