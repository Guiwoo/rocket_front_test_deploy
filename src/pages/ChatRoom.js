import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import SockJS from "sockjs-client"
import * as StompJs from "@stomp/stompjs"
import { useRecoilState } from "recoil"
// import dayjs from "dayjs"
import axios from "axios"

import { currentUserName, currentUserProf } from "../recoil/userAuth"

import ChatSendForm from "../components/Chat/ChatSendForm"
import Container from "../components/Layout/Container"
// import ChatRoomHeader from "../components/Chat/ChatRoomHeader"

import { getUserToken } from "../utils/getUserToken"
// import { createChatBubble } from "../utils/createChatBubble"
import { CHAT_API } from "../apis"

let stompClient
let subscription

function ChatRoom() {
  // stomp & user
  const { roomId } = useParams()
  const [userName, setUserName] = useRecoilState(currentUserName)
  const [userProf, setUserProf] = useRecoilState(currentUserProf)
  const textInputRef = useRef()
  const messageListRef = useRef()
  const [token, setToken] = useState("")

  // 메세지 가져오기
  const [messagePage, setMessagePage] = useState(0)
  const [requestDate, setRequestDate] = useState(0)
  const scrollObserver = useRef()
  const [isMessageEnd, setIsMessageEnd] = useState(false)

  // 채팅방 구독
  const subscribe = () => {
    if (stompClient != null) {
      subscription = stompClient.subscribe(
        `/exchange/chat.exchange/room.${roomId}`,
        (content) => {
          const payload = JSON.parse(content.body)
          console.log(payload)
          // const bubble = createChatBubble(payload, userName)
          // messageListRef.current.appendChild(bubble)

          messageListRef.current.scrollTop = messageListRef.current.scrollHeight
        },
      )
    }
  }

  const roomEnter = async () => {
    const token = await getUserToken()
    const response = await axios.patch(
      "http://localhost:8080/api/v1/chat/room-enter/6369f22dd9488148928dc6a7",
      null,
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      },
    )
    console.log(response)
  }

  useEffect(() => {
    async function getToken() {
      const newToken = await getUserToken()
      setToken(newToken)
    }
    getToken()
  }, [])

  useEffect(() => {
    // stompClient 생성
    if (token !== "") {
      stompClient = new StompJs.Client({
        brokerURL: "ws://52.78.188.101:61613/stomp/chat",
        connectHeaders: {
          login: "user",
          passcode: "password",
          Authorization: token,
        },
        debug: function (str) {
          // 채팅 테스트중에 잠시 핑퐁 꺼둘게요.
          // console.log(str)
        },
        onConnect: () => {
          // 연결 됐을 때 구독 시작
          subscribe()
          roomEnter()
        },
        onStompError: function (frame) {
          console.log("Broker reported error: " + frame.headers["message"])
          console.log("Additional details: " + frame.body)
        },
        onDisconnect: () => {
          disConnect()
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      })
      stompClient.webSocketFactory = function () {
        return new SockJS("http://localhost:8080/stomp/chat")
      }

      stompClient.activate()
      textInputRef.current.focus()
    }

    // 컴포넌트 언마운트 될 때 웹소켓 연결을 끊기
    return () => {
      disConnect()
    }
  }, [token])

  function disConnect() {
    if (stompClient) {
      stompClient.deactivate()
      subscription.unsubscribe()
      console.log("연결 끊어짐")
    }
  }

  // 메세지 전송
  async function handleSubmit(event) {
    event.preventDefault()
    const input = event.target.querySelector("input")
    if (input.value === "") return

    const message = {
      senderName: userName,
      message: input.value,
      senderImgSrc: userProf,
    }

    const token = await getUserToken()

    stompClient.publish({
      destination: `/pub/chat.message.${roomId}`,
      body: JSON.stringify(message),
      headers: {
        Authorization: token,
      },
    })

    input.value = ""
    textInputRef.current.focus()
  }

  // 이전 메세지 가져오기
  async function getMessage() {
    // const date = dayjs(new Date())
    //   .subtract(requestDate, "day")
    //   .format("YYYY-MM-DD")
    const token = await getUserToken()
    const response = await axios.get(
      requestDate >= 2
        ? `${CHAT_API}/api/v1/chat/message/mongo/${roomId}?page=${messagePage}&size=20`
        : `${CHAT_API}/api/v1/chat/message/${roomId}?date=${"2022-11-08"}&page=${messagePage}&size=20`,
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      },
    )

    const prevList = response.data.result.content

    console.log(response)

    const scrollMarkElement = scrollObserver.current.nextElementSibling

    prevList.forEach((data) => {
      // const bubble = createChatBubble(data, userName)
      // scrollObserver.current.after(bubble)
    })

    if (scrollMarkElement) {
      const scrollMark = scrollMarkElement.offsetTop
      console.log("scroll to : ", scrollMark)
      // window.scrollTo(0, scrollMark)
      scrollMarkElement.scrollIntoView()
    }

    // 마지막 날, 마지막 페이지일 때 => 메세지 끝(더 이상 불러오지 않음)
    if (response.data.result.lastDay && response.data.result.lastPage) {
      console.log("메세지 끝")
      setIsMessageEnd(true)
      scrollObserver.current.classList.add("hidden")
    }

    // 마지막 페이지일 때 => 날짜가 넘어감
    if (response.data.result.lastPage) {
      setMessagePage(0)
      setRequestDate(requestDate + 1)
    }
  }

  useEffect(() => {
    // 메세지가 끝이 아닐 때만 불러옴
    if (!isMessageEnd) {
      getMessage()
    }
  }, [messagePage])

  useEffect(() => {
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setMessagePage(messagePage + 1)
          console.log("detected!!!!")
        }
      })
    }, {})
    io.observe(scrollObserver.current)
  }, [])

  return (
    <>
      <Container>
        {/* 채팅방 나가기 */}
        {/* <ChatRoomHeader /> */}

        {/* 채팅 내용 나타나는 부분 */}
        <div
          className="w-full overflow-hidden relative"
          style={{
            height: "calc(100vh - 159px)",
          }}
        >
          <ul
            className="scrollhide flex flex-col pt-4 overflow-y-scroll absolute top-0 left-0 bottom-0 right-0"
            ref={messageListRef}
          >
            <li
              ref={scrollObserver}
              className="h-20 flex mb-10 mt-auto bg-teal-200"
            >
              메세지 로딩중
            </li>
          </ul>
        </div>

        {/* 채팅 보내는 부분 */}
        <ChatSendForm handleSubmit={handleSubmit} textInputRef={textInputRef} />
      </Container>
    </>
  )
}

export default ChatRoom
