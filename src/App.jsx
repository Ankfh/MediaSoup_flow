import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import { Device } from "mediasoup-client";
const roomName = "heloo";
const socket = io("https://192.168.100.7:3001");

function App() {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  let device = null;
  let rtpCapabilities = null;
  let producerTransport = null;
  let consumerTransports = [];
  let producer = null;
  let consumer = null;
  let isProducer = false;
  let mainParams = {
    encoding: [
      {
        rid: "0",
        maxBitrate: "100000",
        scalabilityMode: "S1T3",
      },
      {
        rid: "2",
        maxBitrate: "300000",
        scalabilityMode: "S1T3",
      },
      {
        rid: "3",
        maxBitrate: "900000",
        scalabilityMode: "S1T3",
      },
    ],
    codecOptions: {
      VideoGoogleStartBitrate: 1000,
    },
  };

  socket.on("connection-success", ({ socketId, existsProducer }) => {
    console.log(existsProducer, "existsProducer");
    getLocalStream();
  });
  /// get local stream ................
  const getLocalStream = async () => {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audo: false,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      });
      localVideoRef.current.srcObject = localStream;
      const track = localStream.getVideoTracks()[0];
      mainParams = {
        track,
        ...mainParams,
      };
      joinRoom();
    } catch (error) {
      console.log(error, "error in geting local stream");
    }
  };
  const joinRoom = () => {
    socket.emit("joinRoom", { roomName }, (data) => {
      console.log(data, "rtpCapabilities in JoinRoom==");
      rtpCapabilities = data.rtpCapabilities;
      createDevice();
    });
  };
  // const goCreateTransport = () => {
  //   console.log(isProducer, "isporudcer");
  //   if (isProducer) {
  //     createSendTransport();
  //   } else {
  //     createRecvTransport();
  //   }
  // };

  // const groConsume = () => {
  //   goConnect(false);
  // };
  /// create deviece
  const createDevice = async (data) => {
    try {
      const deviceInstance = new Device();
      console.log(rtpCapabilities, "in - - createDevice");
      await deviceInstance.load({
        routerRtpCapabilities: rtpCapabilities,
      });
      device = deviceInstance;
      console.log("device created");
      createSendTransport();
    } catch (error) {
      console.log(error, "error in createDevice");
      if (error.name === "UnsupportedError") {
        console.log("browser not support");
      }
    }
  };

  // const getRtp = () => {
  //   socket.emit("createRoom", (data) => {
  //     rtpCapabilities = data;
  //     console.log(data, "rtpCapabilities");
  //     createDevice();
  //   });
  // };

  // const goConnect = (producerOrConsumer) => {
  //   isProducer = producerOrConsumer;
  //   device ? goCreateTransport() : getRtp();
  // };
  socket.on("new_producer", ({ producerId }) =>
    singleNewConsumerTransport(producerId)
  );
  // get the prodcer if exists
  const getProducers = () => {
    socket.emit("getProducer", (producerIds) => {
      console.log("ids list in getproducer", producerIds);
      producerIds.forEach((id) => singleNewConsumerTransport(id));
    });
  };

  /// create a sender transport
  const createSendTransport = () => {
    try {
      socket.emit(
        "create_webrtc_transport",
        { consumer: false },
        async (data) => {
          console.log(data, "data in create_webrtc_transport ");

          const createdProducerTransport = await device?.createSendTransport(
            data.params
          );
          producerTransport = createdProducerTransport;
          producerTransport.on(
            "connect",
            async ({ dtlsParameters }, callback) => {
              try {
                await socket.emit("transport_connect", {
                  // transportId: producerTransport.id,
                  dtlsParameters: dtlsParameters,
                });
                callback();
              } catch (error) {}
            }
          );
          producerTransport.on(
            "produce",
            async (parameters, callback, errback) => {
              try {
                console.log(parameters, "parameters in produce event ");
                await socket.emit(
                  "transport_produce",
                  {
                    transportId: producerTransport.id,
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    appData: parameters.appData,
                  },
                  ({ id, producerExist }) => {
                    callback({ id });

                    if (producerExist) {
                      getProducers();
                    }
                  }
                );
              } catch (error) {
                console.log(error, "error in producerTransport.on( ");
              }
            }
          );
          connectSendTransport();
        }
      );
    } catch (error) {
      console.log(error, "error in createSendTransport");
    }
  };

  /// connect send transport ...................
  const connectSendTransport = async () => {
    try {
      console.log(mainParams, "paramss==");
      const connectProducer = await producerTransport.produce(mainParams);
      producer = connectProducer;
      producer.on("trackended", () => {
        console.log("tracked closed");
      });

      producer.on("transportclose", () => {
        console.log("transport closed");
      });
    } catch (error) {
      console.log(error, "error in connectSendTransport");
    }
  };

  // create tansport for reciever end....
  const singleNewConsumerTransport = (remoteProducerId) => {
    try {
      socket.emit("create_webrtc_transport", { consumer: true }, (data) => {
        console.log(data, "params in createRecvTransport  ");
        const createdRecvTransport = device.createRecvTransport(data.params);
        const consumerTransport = createdRecvTransport;
        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback) => {
            try {
              const serverConsumerTransportId = data.params.id;
              await socket.emit("transport_recv_connect", {
                // transportId: RecvTransport.id,
                dtlsParameters: dtlsParameters,
                serverConsumerTransportId,
              });
              callback();
            } catch (error) {
              console.log(error, "erro in ");
            }
          }
        );
        connectRecvTransport(
          consumerTransport,
          remoteProducerId,
          data.params.id
        );
      });
    } catch (error) {
      console.log(error, "error in createRecvTransport");
    }
  };

  /// connect the reciver transport
  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId
  ) => {
    console.log("clicked");
    try {
      await socket.emit(
        "consume",
        {
          rtpCapabilities: device.rtpCapabilities,
          remoteProducerId,
          serverConsumerTransportId,
        },
        async ({ parameters }) => {
          try {
            console.log(parameters, "parameters in consume event callback ");
            const consumer = await consumerTransport.consume({
              id: parameters.id,
              producerId: parameters.producerId,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            });
            console.log(consumerTransport, "consumerTransport0--0--0-0-0-0");
            consumerTransports = [
              ...consumerTransports,
              {
                consumerTransport,
                serverConsumerTransportId: serverConsumerTransportId,
                producerId: remoteProducerId,
                consumer,
              },
            ];
            const { track } = consumer;
            // localVideoRef.current.srcObject = new MediaStream([track]);
            setRemoteStreams((prevStreams) => [
              ...prevStreams,
              { id: remoteProducerId, track },
            ]);
            socket.emit("consumer_resume", {
              serverConsumerId: parameters.severConsumerId,
            });

            console.log(track, "trakkk==");
          } catch (error) {
            console.log(error, "error in createdProducerTransport.on( ");
          }
        }
      );
    } catch (error) {
      console.log(error, "error in connectConsumer");
    }
  };

  socket.on("producer-close", ({ remoteProducerId }) => {
    console.log(remoteProducerId, "========remoteProducerId===========");
    setRemoteStreams((prevStreams) =>
      prevStreams.filter((stream) => stream.id !== remoteProducerId)
    );
    const producerToClosed = consumerTransports.find((transportData) => {
      console.log(transportData.producerId, "transportdata");
      return transportData.producerId === remoteProducerId;
    });
    console.log(producerToClosed, "producerToClosed==");
    producerToClosed.consumerTransport.close();
    producerToClosed.consumer.close();
    consumerTransports = consumerTransports.filter(
      (transportData) => transportData.producerId !== remoteProducerId
    );
  });
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">MediaSoup Broadcast</h1>

      <div className="flex flex-col md:flex-row md:space-x-4">
        <div className="mb-4 md:mb-0">
          <h2 className="text-xl font-semibold mb-2">Local Video</h2>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            className="w-full max-w-xs rounded-lg border border-gray-700"
          />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Remote Videos</h2>
          <div className="grid grid-cols-1 gap-4">
            {remoteStreams.map((stream) => (
              <video
                key={stream.id}
                ref={(videoElement) => {
                  if (videoElement && stream.track) {
                    const mediaStream = new MediaStream([stream.track]);
                    if (videoElement.srcObject !== mediaStream) {
                      videoElement.srcObject = mediaStream;
                    }
                  }
                }}
                className="w-full max-w-xs rounded-lg border border-gray-700"
                autoPlay
                controls
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
